// Build-only npm payloads. PLAN_PATH names a plan committed at candidate H:
// { releases: [{ name, oldVersion, newVersion, type }] } (Changesets format).
// .release-candidate.json records preparation S, NOT the package inventory or H.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectNativeOptionalDeps } from './inject-native-optional-deps.mjs';
import { cliSupportPackageJson } from './publish-cli-support.mjs';

const runCommand = (command, args, options) =>
  execFileSync(command, args, { encoding: 'utf8', ...options });

export async function packVersionCandidate({
  root = process.cwd(),
  sourceSha = process.env.SOURCE_SHA,
  planPath = process.env.PLAN_PATH || '.release-plan.json',
  outputDirectory = process.env.OUTPUT_DIR || join(root, 'candidate-packages'),
  runId = process.env.GITHUB_RUN_ID,
  runAttempt = process.env.GITHUB_RUN_ATTEMPT,
  run = runCommand,
} = {}) {
  assert.match(
    sourceSha || '',
    /^[a-f0-9]{40}$/,
    'Expected exact candidate SHA'
  );
  const options = { cwd: root, maxBuffer: 20 * 1024 * 1024 };
  assert.equal(run('git', ['rev-parse', 'HEAD'], options).trim(), sourceSha);
  const planFile = relative(root, resolve(root, planPath));
  assert(
    planFile && !planFile.startsWith('..') && !isAbsolute(planFile),
    'PLAN_PATH must be inside the repository'
  );
  // Read committed bytes, not a stale or edited working-tree plan.
  const plan = JSON.parse(
    run('git', ['show', `${sourceSha}:${planFile}`], options)
  );
  assert(Array.isArray(plan.releases), 'Expected releases array');
  const workspace = JSON.parse(
    run('pnpm', ['ls', '-r', '--depth', '-1', '--json'], options)
  );
  const cliVersion = JSON.parse(
    run('git', ['show', `${sourceSha}:packages/cli/package.json`], options)
  ).version;
  assert.match(cliVersion || '', /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/);
  const selected = [];
  const seen = new Set();
  for (const release of plan.releases) {
    assert(
      release && typeof release.name === 'string',
      'Expected release name'
    );
    assert(!seen.has(release.name), `Duplicate release: ${release.name}`);
    seen.add(release.name);
    assert(
      ['none', 'patch', 'minor', 'major'].includes(release.type),
      `Invalid release type: ${release.name}`
    );
    if (release.type === 'none') continue;
    assert.equal(typeof release.oldVersion, 'string', 'Expected oldVersion');
    assert.match(
      release.newVersion || '',
      /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/
    );
    const matches = workspace.filter(pkg => pkg.name === release.name);
    assert.equal(
      matches.length,
      1,
      `Unknown or ambiguous package: ${release.name}`
    );
    const path = join(matches[0].path, 'package.json');
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(pkg.name, release.name);
    assert.equal(
      pkg.version,
      release.newVersion,
      `Version mismatch: ${pkg.name}`
    );
    if (pkg.private !== true)
      selected.push({ release, path, dir: matches[0].path });
  }

  // Freeze the same dependency-first order the workspace publisher used at H.
  // The post-merge publisher must not rediscover a dependency graph.
  const topologicalPaths = run(
    'pnpm',
    ['--workspace-concurrency=1', 'recursive', 'exec', 'pwd'],
    options
  )
    .trim()
    .split(/\r?\n/);
  const ordered = topologicalPaths.flatMap(dir =>
    selected.filter(pkg => pkg.dir === dir)
  );
  assert.equal(ordered.length, selected.length, 'Incomplete workspace order');
  assert.equal(
    new Set(ordered).size,
    selected.length,
    'Duplicate workspace path'
  );

  outputDirectory = resolve(outputDirectory);
  // Exclusive destination: retries must never mix old and new payloads.
  await mkdir(outputDirectory);
  const packages = [];
  for (const { release, path, dir } of ordered) {
    const original = await readFile(path);
    let stdout;
    try {
      if (release.name === 'vercel') {
        await injectNativeOptionalDeps({
          cliPackageJsonPath: path,
          skipNativeDeps: false,
          includeCliSupport: true,
          isPublished: async () => false,
        });
      }
      // Keep production lifecycle hooks: CLI prepack pins `builders`, postpack
      // restores them. pnpm resolves workspace:*; npm pack does not.
      stdout = run('pnpm', ['pack', '--pack-destination', outputDirectory], {
        ...options,
        cwd: dir,
        env: { ...process.env, npm_config_ignore_scripts: 'false' },
      });
    } finally {
      if (release.name === 'vercel') await writeFile(path, original);
    }
    const reported = stdout.trim().split(/\r?\n/).at(-1).trim();
    const tarball = basename(reported);
    assert(
      tarball.endsWith('.tgz') &&
        resolve(outputDirectory, reported) === join(outputDirectory, tarball) &&
        !packages.some(pkg => pkg.tarball === tarball),
      'Expected a unique tarball inside the output directory'
    );
    const file = join(outputDirectory, tarball);
    const packed = JSON.parse(
      run('tar', ['-xOf', file, 'package/package.json'], options)
    );
    assert.equal(packed.name, release.name, 'Packed name mismatch');
    assert.equal(packed.version, release.newVersion, 'Packed version mismatch');
    assert(!Object.hasOwn(packed, 'tag'), `Unsafe tag: ${release.name}`);
    if (Object.hasOwn(packed, 'publishConfig')) {
      const config = packed.publishConfig;
      assert(
        config &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          Object.entries(config).every(
            ([key, value]) =>
              (key === 'access' && value === 'public') ||
              (key === 'registry' &&
                typeof value === 'string' &&
                /^https:\/\/registry\.npmjs\.org\/?$/.test(value))
          ),
        `Unsafe publishConfig: ${release.name}`
      );
    }
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'builders',
    ]) {
      assert(
        !Object.values(packed[field] || {}).some(value =>
          value.startsWith('workspace:')
        ),
        `Unresolved ${field}: ${release.name}`
      );
    }
    if (release.name === 'vercel') {
      packages.push(
        await packCliSupport({ file, outputDirectory, run, options })
      );
    }
    const row = {
      name: release.name,
      version: release.newVersion,
      tarball,
      ...(await packageDigest(file)),
    };
    const changelogSource = relative(root, join(dir, 'CHANGELOG.md'));
    if (
      run(
        'git',
        ['ls-tree', '--name-only', sourceSha, '--', changelogSource],
        options
      ).trim()
    ) {
      row.changelog = `changelogs/${tarball}.md`;
      await mkdir(join(outputDirectory, 'changelogs'), { recursive: true });
      await writeFile(
        join(outputDirectory, row.changelog),
        run('git', ['show', `${sourceSha}:${changelogSource}`], {
          ...options,
          encoding: null,
        })
      );
    }
    packages.push(row);
  }
  if (packages.some(pkg => pkg.name === 'vercel')) {
    await mkdir(join(outputDirectory, 'native-wrapper', 'bin'), {
      recursive: true,
    });
    for (const [source, destination] of [
      ['packages/vc-native/bin/vercel', 'native-wrapper/bin/vercel'],
      ['packages/vc-native/postinstall.mjs', 'native-wrapper/postinstall.mjs'],
      ['packages/cli/CHANGELOG.md', 'cli-changelog.md'],
    ]) {
      await writeFile(
        join(outputDirectory, destination),
        run('git', ['show', `${sourceSha}:${source}`], {
          ...options,
          encoding: null,
        })
      );
    }
  }
  const manifest = {
    schemaVersion: 1,
    sourceSha,
    cliVersion,
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    planPath: planFile,
    releases: plan.releases,
    // .changeset/config.json enables privatePackages.tag, independently of npm.
    tags: plan.releases
      .filter(release => release.type !== 'none')
      .map(release => ({ name: release.name, version: release.newVersion })),
    packages,
  };
  // Only a completely packed/verified inventory gets a completion manifest.
  await writeFile(
    join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx' }
  );
  return manifest;
}

async function packageDigest(file) {
  const bytes = await readFile(file);
  return {
    size: bytes.length,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

// Build the JS fallback from the exact CLI tarball tested in this run.
async function packCliSupport({ file, outputDirectory, run, options }) {
  const dir = await mkdtemp(join(tmpdir(), 'cli-support-'));
  try {
    run('tar', ['-xzf', file, '-C', dir, '--strip-components=1'], options);
    const packagePath = join(dir, 'package.json');
    const vercelPackage = JSON.parse(await readFile(packagePath, 'utf8'));
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(
      join(dir, 'dist', 'package.json'),
      `${JSON.stringify(vercelPackage, null, 2)}\n`
    );
    const pkg = cliSupportPackageJson(vercelPackage);
    await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    const [packed] = JSON.parse(
      run(
        'npm',
        [
          'pack',
          '--ignore-scripts',
          '--json',
          '--pack-destination',
          outputDirectory,
        ],
        { ...options, cwd: dir }
      )
    );
    const tarball = basename(packed.filename);
    return {
      name: pkg.name,
      version: pkg.version,
      tarball,
      generated: true,
      ...(await packageDigest(join(outputDirectory, tarball))),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  packVersionCandidate().catch(error => {
    console.error(`pack-version-candidate: ${error.message}`);
    process.exitCode = 1;
  });
}
