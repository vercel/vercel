/**
 * Build and test planned Python releases with --pack-only, then publish the
 * saved distributions with --artifacts. These modes cannot be combined.
 * Package discovery is based on `utils/get-python-packages.js`.
 */

import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  rmSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PYTHON_VERSIONS_PATH = 'packages/python/src/package-versions.ts';
const require = createRequire(import.meta.url);
const { getPythonPackages } = require('../utils/get-python-packages.js');

function toVersionExportName(packageName) {
  const normalized = packageName
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `${normalized}_VERSION`;
}

function getPackages() {
  return getPythonPackages(root).map(pkg => ({
    name: pkg.packageName,
    nodePackageName: pkg.nodePackageName,
    projectDir: pkg.projectDir,
    versionPin: {
      path: PYTHON_VERSIONS_PATH,
      exportName: toVersionExportName(pkg.packageName),
    },
    pyprojectPath: `${pkg.projectDir}/pyproject.toml`,
    testsPath: `${pkg.projectDir}/tests`,
  }));
}

class UsageError extends Error {}

function parseVersion(tomlContent) {
  const match = tomlContent.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('Could not parse version from pyproject.toml');
  }
  return match[1];
}

function parseArgs(argv) {
  let packOnly = false;
  const paths = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--pack-only') {
      packOnly = true;
      continue;
    }

    if (['--plan', '--out', '--artifacts'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new UsageError(`missing value for option "${arg}"`);
      }
      paths[arg.slice(2)] = resolve(value);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    throw new UsageError(`unrecognized argument: ${arg}`);
  }

  if (packOnly === Boolean(paths.artifacts)) {
    throw new UsageError(
      'invalid publication mode: specify exactly one of --pack-only or --artifacts'
    );
  }
  if (packOnly && (!paths.plan || !paths.out)) {
    throw new UsageError(
      'cannot pack Python releases: --plan and --out are required'
    );
  }
  if (!packOnly && (paths.plan || paths.out)) {
    throw new UsageError('cannot use --plan or --out: --pack-only is required');
  }

  return { packOnly, ...paths };
}

function printUsage() {
  console.log(`Usage:
  node python/publish.mjs --pack-only --plan <path> --out <dir>
  node python/publish.mjs --artifacts <dir>

Options:
  --pack-only       Build and wheel-test changed Python packages in the plan.
  --plan <path>     Changesets release plan with frozen newVersion values.
  --out <dir>       Write distributions and manifest.json here.
  --artifacts <dir> Publish only saved manifest files; never build or test.
`);
}

function run(cmd, args) {
  const cmdline = `${cmd} ${args.join(' ')}`;
  console.log(`$ ${cmdline}`);
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: root });
  } catch (err) {
    const code = err.status ?? 1;
    throw new Error(`command failed with exit code ${code}: ${cmdline}`);
  }
}

function assertVersionPin(pkg, currentVersion) {
  const versionPinPath = resolve(root, pkg.versionPin.path);
  const pinnedContent = readFileSync(versionPinPath, 'utf8');
  const versionRegex = new RegExp(
    `${pkg.versionPin.exportName}\\s*=\\s*['"]([^'"]+)['"]`
  );
  const pinnedMatch = pinnedContent.match(versionRegex);

  if (!pinnedMatch) {
    throw new Error(
      `Could not parse ${pkg.versionPin.exportName} from ${pkg.versionPin.path}`
    );
  }

  if (pinnedMatch[1] !== currentVersion) {
    throw new Error(
      `Version mismatch for ${pkg.name}: pyproject.toml has ${currentVersion} but ` +
        `${pkg.versionPin.path} pins ${pinnedMatch[1]}`
    );
  }
}

function buildAndTest(pkg, currentVersion, distDir) {
  assertVersionPin(pkg, currentVersion);

  // Clean stale artifacts so globs match exactly one wheel.
  rmSync(distDir, { recursive: true, force: true });

  run('uv', ['build', '--package', pkg.name, '--out-dir', `${distDir}/`]);

  const files = readdirSync(distDir);
  const wheels = files.filter(file => file.endsWith('.whl'));
  if (wheels.length !== 1) {
    throw new Error(
      `invalid distributions for package "${pkg.name}": expected exactly 1 wheel in "${distDir}", found ${wheels.length}`
    );
  }
  const sdists = files.filter(file => file.endsWith('.tar.gz'));
  if (sdists.length !== 1) {
    throw new Error(
      `invalid distributions for package "${pkg.name}": expected exactly 1 sdist in "${distDir}", found ${sdists.length}`
    );
  }
  const wheelPath = join(distDir, wheels[0]);

  run('uv', [
    'run',
    '--only-group=test',
    '--locked',
    '--isolated',
    `--project=${pkg.projectDir}`,
    '--with',
    wheelPath,
    'pytest',
    '-v',
    '--tb=short',
    '-k',
    'not test_cqa_',
    pkg.testsPath,
  ]);

  return [wheelPath, join(distDir, sdists[0])];
}

function packPackages(packages, { plan, out }) {
  const { releases } = JSON.parse(readFileSync(plan, 'utf8'));
  const manifest = { packages: [] };
  mkdirSync(out, { recursive: true });
  const manifestPath = join(out, 'manifest.json');
  rmSync(manifestPath, { force: true });

  for (const pkg of packages) {
    const release = releases.find(
      release => release.name === pkg.nodePackageName
    );
    if (!release || release.type === 'none') continue;

    const version = parseVersion(
      readFileSync(resolve(root, pkg.pyprojectPath), 'utf8')
    );
    if (version !== release.newVersion) {
      throw new Error(
        `invalid version for package "${pkg.name}": pyproject.toml has ${version}, plan requires ${release.newVersion}`
      );
    }
    const files = buildAndTest(pkg, version, join(out, pkg.name, 'dist'));
    manifest.packages.push({
      name: pkg.name,
      version,
      files: files.map(file => relative(out, file).replaceAll('\\', '/')),
    });
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function publishedFilesOnPyPI(packageName, version) {
  const url = `https://pypi.org/pypi/${packageName}/${version}/json`;
  console.log(`Checking PyPI: ${url}`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return new Set();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { urls } = await res.json();
    if (
      !Array.isArray(urls) ||
      urls.some(
        file => typeof file?.filename !== 'string' || file.filename.length === 0
      )
    ) {
      throw new Error(
        'invalid PyPI response: expected "urls" entries with filenames'
      );
    }
    return new Set(urls.map(file => file.filename));
  } catch (err) {
    throw new Error(
      `could not list published files for package "${packageName}" ${version}: ${err.message}`
    );
  }
}

async function publishArtifacts(directory) {
  const { packages } = JSON.parse(
    readFileSync(join(directory, 'manifest.json'), 'utf8')
  );
  for (const pkg of packages) {
    const publishedFiles = await publishedFilesOnPyPI(pkg.name, pkg.version);
    if (pkg.files.length === 0) {
      throw new Error(
        `cannot publish package "${pkg.name}": no saved distributions`
      );
    }
    // A previous attempt may have uploaded only the wheel or only the sdist.
    const missingFiles = pkg.files.filter(
      file => !publishedFiles.has(basename(file))
    );
    if (missingFiles.length === 0) {
      console.log(
        `Python ${pkg.name} ${pkg.version} files already on PyPI, skipping publication.`
      );
      continue;
    }
    // Relies on OIDC trusted publishing env set by release workflows.
    run('uv', [
      'publish',
      ...missingFiles.map(file => resolve(directory, file)),
    ]);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.artifacts) return publishArtifacts(options.artifacts);
  return packPackages(getPackages(), options);
}

main().catch(error => {
  if (error instanceof UsageError) {
    console.error(error.message);
    console.error('');
    printUsage();
  } else {
    console.error(error);
  }
  process.exit(1);
});
