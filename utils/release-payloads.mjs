// Linux fan-in: reuse the native stager, keep candidate tarballs, save one bundle.
// Signing is in native-binaries.yml; publication is in npm-publish.sh.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { platforms } from '../packages/vc-native/scripts/platforms.mjs';

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export async function packRelease({
  candidateDirectory,
  binaryDirectory,
  outputDirectory,
  root = repoRoot,
  run = exec,
}) {
  const candidate = JSON.parse(
    await readFile(join(candidateDirectory, 'manifest.json'), 'utf8')
  );
  const cli = candidate.packages.find(p => p.name === 'vercel');
  const npm = join(outputDirectory, 'npm');
  await mkdir(outputDirectory);
  await mkdir(npm);
  for (const pkg of candidate.packages) {
    await copyFile(
      join(candidateDirectory, pkg.tarball),
      join(npm, pkg.tarball)
    );
  }
  // Python distributions were built and tested in the same candidate CI run.
  await cp(
    join(candidateDirectory, 'python'),
    join(outputDirectory, 'python'),
    { recursive: true }
  );
  await cp(
    join(candidateDirectory, 'changelogs'),
    join(outputDirectory, 'changelogs'),
    { recursive: true }
  ).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  const nativePackages = [];
  if (cli) {
    assert.equal(cli.version, candidate.cliVersion);
    const native = join(root, 'packages/vc-native');
    const binaries = join(root, 'packages/cli/dist-bin');
    const assets = join(outputDirectory, 'native');
    await mkdir(binaries, { recursive: true });
    await mkdir(assets);
    for (const { asset } of platforms) {
      const source = join(binaryDirectory, asset);
      await copyFile(source, join(binaries, asset));
      await copyFile(source, join(assets, asset));
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(source)) hash.update(chunk);
      await writeFile(
        join(assets, `${asset}.sha256`),
        `${hash.digest('hex')}  ${asset}\n`
      );
    }
    // Only these data files come from H. The staging script stays from main.
    await copyFile(
      join(candidateDirectory, 'native-wrapper/bin/vercel'),
      join(native, 'bin/vercel')
    );
    await copyFile(
      join(candidateDirectory, 'native-wrapper/postinstall.mjs'),
      join(native, 'postinstall.mjs')
    );
    await run(process.execPath, [join(native, 'scripts/stage-packages.mjs')], {
      env: { ...process.env, VERCEL_VC_NATIVE_VERSION: cli.version },
    });
    for (const name of [...platforms.map(p => p.name), '@vercel/vc-native']) {
      const cwd = join(native, 'dist-native', name.replace('@vercel/', ''));
      const { stdout } = await run(
        'npm',
        [
          'pack',
          '--ignore-scripts',
          '--json',
          '--pack-destination',
          resolve(npm),
        ],
        { cwd }
      );
      const [packed] = JSON.parse(stdout);
      nativePackages.push({
        name,
        version: cli.version,
        tarball: packed.filename,
        size: packed.size,
        integrity: packed.integrity,
      });
    }
    await copyFile(
      join(candidateDirectory, 'cli-changelog.md'),
      join(outputDirectory, 'cli-changelog.md')
    );
  }
  const manifest = {
    sourceSha: candidate.sourceSha,
    cliVersion: cli?.version || '',
    // Native dependencies first; preserve CI's pnpm order; CLI last, as before.
    packages: [
      ...nativePackages,
      ...candidate.packages.filter(p => p.name !== 'vercel'),
      ...(cli ? [cli] : []),
    ],
    tags: candidate.tags,
    releases: candidate.packages.filter(pkg => !pkg.generated),
  };
  await writeFile(
    join(npm, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [candidateDirectory, binaryDirectory, outputDirectory] =
    process.argv.slice(2);
  packRelease({ candidateDirectory, binaryDirectory, outputDirectory }).catch(
    error => {
      console.error(error.message);
      process.exitCode = 1;
    }
  );
}
