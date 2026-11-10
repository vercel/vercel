const { deepStrictEqual: equal, rejects, fail } = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./release-payloads.mjs');
const targets = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
  'win32-arm64',
  'win32-x64',
];
const assets = targets.map(
  t =>
    `vercel-${t.replace('win32', 'windows')}${t.startsWith('win32') ? '.exe' : ''}`
);
const nativeNames = [
  ...targets.map(t => `@vercel/vc-native-${t}`),
  '@vercel/vc-native',
];
const pythonFiles = ['runtime/dist/runtime.whl', 'workers/dist/workers.tar.gz'];
const wrapperFiles = ['bin/vercel', 'postinstall.mjs'];
const wrapperSource = "throw new Error('candidate source must not execute');\n";
const trustedSource = '// trusted staging script from main\n';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function put(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
async function sameFile(from, to, file) {
  equal(await readFile(join(from, file)), await readFile(join(to, file)));
}

async function fixture(cli, check) {
  const root = await mkdtemp(join(tmpdir(), 'release payloads '));
  const f = {
    root,
    candidateDirectory: join(root, 'candidate'),
    binaryDirectory: join(root, 'binaries'),
    outputDirectory: join(root, 'output'),
    native: join(root, 'packages/vc-native'),
    run: async () => fail('unexpected subprocess'),
  };
  const source = f.candidateDirectory;
  // Deliberately not alphabetical: preserve CI's dependency order, CLI last.
  const names = ['@fixture/z-dependency', '@fixture/a-consumer'];
  if (cli) names.unshift('vercel');
  f.manifest = {
    sourceSha: 'b'.repeat(40),
    cliVersion: cli ? '1.1.0' : '',
    tags: [
      { name: '@fixture/private', version: '2.0.1' },
      ...names.map(name => ({ name, version: '1.1.0' })),
    ],
    packages: names.map((name, i) => ({
      name,
      version: '1.1.0',
      tarball: `original-${i}.tgz`,
      size: 17,
      integrity: `sha512-original-${i}`,
    })),
  };
  try {
    await put(join(source, 'manifest.json'), JSON.stringify(f.manifest));
    for (const pkg of f.manifest.packages) {
      await put(join(source, pkg.tarball), `\0original ${pkg.name}\r\n`);
    }
    for (const file of pythonFiles) {
      await put(join(source, 'python', file), `plain Python data: ${file}`);
    }
    if (cli) {
      for (const asset of assets) {
        await put(join(f.binaryDirectory, asset), `\0binary ${asset}\r\n`);
      }
      for (const file of wrapperFiles) {
        await put(join(source, 'native-wrapper', file), wrapperSource);
        await put(join(f.native, file), '// old wrapper\n');
      }
      await put(join(f.native, 'scripts/stage-packages.mjs'), trustedSource);
      await put(
        join(source, 'native-wrapper/scripts/stage-packages.mjs'),
        wrapperSource
      );
      await put(join(source, 'cli-changelog.md'), '# Candidate CLI\r\n');
      await put(
        join(source, 'changelogs/builder.md'),
        '# Saved builder notes\r\n'
      );
    }
    await check(f, (await load).packRelease);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('keeps candidate bytes and stages wrapper data with trusted code; native first, CLI last', async () => {
  await fixture(true, async (f, packRelease) => {
    const calls = [];
    const generated = [];
    const source = f.candidateDirectory;
    const npm = join(f.outputDirectory, 'npm');
    const stage = join(f.native, 'scripts/stage-packages.mjs');
    f.run = async (command, args, options) => {
      calls.push(command);
      if (calls.length === 1) {
        equal(command, process.execPath);
        equal(args, [stage]);
        equal(options.env.VERCEL_VC_NATIVE_VERSION, '1.1.0');
        equal(await readFile(stage, 'utf8'), trustedSource);
        for (const file of wrapperFiles) {
          await sameFile(join(source, 'native-wrapper'), f.native, file);
        }
        const staged = join(f.root, 'packages/cli/dist-bin');
        for (const asset of assets)
          await sameFile(f.binaryDirectory, staged, asset);
        return { stdout: '' };
      }
      const name = nativeNames[generated.length];
      equal(command, 'npm');
      equal(args, [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        npm,
      ]);
      equal(
        options.cwd,
        join(f.native, 'dist-native', name.replace('@vercel/', ''))
      );
      const filename = `native-${generated.length}.tgz`;
      const bytes = Buffer.from(`plain packed data: ${name}`);
      const metadata = {
        filename,
        size: bytes.length,
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      };
      await writeFile(join(npm, filename), bytes);
      generated.push({
        name,
        version: '1.1.0',
        tarball: filename,
        size: metadata.size,
        integrity: metadata.integrity,
      });
      return { stdout: JSON.stringify([metadata]) };
    };
    const manifest = await packRelease(f);
    const packages = f.manifest.packages;
    equal(calls, [process.execPath, ...Array(9).fill('npm')]);
    equal(manifest, {
      sourceSha: f.manifest.sourceSha,
      cliVersion: '1.1.0',
      packages: [...generated, ...packages.slice(1), packages[0]],
      tags: f.manifest.tags,
      releases: packages,
    });
    equal(
      JSON.parse(await readFile(join(npm, 'manifest.json'), 'utf8')),
      manifest
    );
    for (const pkg of packages) await sameFile(source, npm, pkg.tarball);
    const native = join(f.outputDirectory, 'native');
    equal(
      (await readdir(native)).sort(),
      assets.flatMap(a => [a, `${a}.sha256`]).sort()
    );
    for (const asset of assets) {
      const bytes = await readFile(join(f.binaryDirectory, asset));
      await sameFile(f.binaryDirectory, native, asset);
      equal(
        await readFile(join(native, `${asset}.sha256`), 'utf8'),
        `${sha256(bytes)}  ${asset}\n`
      );
    }
    await sameFile(source, f.outputDirectory, 'cli-changelog.md');
    await sameFile(source, f.outputDirectory, 'changelogs/builder.md');
    for (const file of pythonFiles) {
      await sameFile(source, f.outputDirectory, join('python', file));
    }
  });
});

for (const privateOnly of [false, true]) {
  test(`${privateOnly ? 'private-only' : 'non-CLI'} releases keep tags and Python without native commands`, async () => {
    await fixture(false, async (f, packRelease) => {
      const source = f.candidateDirectory;
      if (privateOnly) {
        for (const pkg of f.manifest.packages)
          await rm(join(source, pkg.tarball));
        f.manifest.packages = [];
        f.manifest.tags = [{ name: '@fixture/private', version: '2.0.1' }];
        await writeFile(
          join(source, 'manifest.json'),
          JSON.stringify(f.manifest)
        );
      }
      const manifest = await packRelease(f);
      equal(manifest, {
        sourceSha: f.manifest.sourceSha,
        cliVersion: '',
        packages: f.manifest.packages,
        tags: f.manifest.tags,
        releases: f.manifest.packages,
      });
      const npm = join(f.outputDirectory, 'npm');
      equal(
        (await readdir(npm)).sort(),
        ['manifest.json', ...f.manifest.packages.map(p => p.tarball)].sort()
      );
      equal(
        JSON.parse(await readFile(join(npm, 'manifest.json'), 'utf8')),
        manifest
      );
      equal((await readdir(f.outputDirectory)).sort(), ['npm', 'python']);
      for (const file of pythonFiles) {
        await sameFile(source, f.outputDirectory, join('python', file));
      }
      await rejects(packRelease(f), { code: 'EEXIST' });
    });
  });
}
