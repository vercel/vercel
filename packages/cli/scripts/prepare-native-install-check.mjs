#!/usr/bin/env node
// Build the package set that native-install-check.mjs serves from a local registry:
//   - the packed `vercel` with native optionalDependencies injected exactly
//     as at release time, and its regular dependencies removed so only a
//     native binary can run it;
//   - the native packages staged from packages/cli/dist-bin;
//   - manifest-only stand-ins for platforms this job did not build, so every
//     injected optionalDependency resolves the way it does on npm, including
//     @vercel/cli-support.
//
// Usage:
//   node packages/cli/scripts/prepare-native-install-check.mjs \
//     --vercel-tarball <vercel-x.y.z.tgz> --out <dir>

import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { injectNativeOptionalDeps } from '../../../utils/inject-native-optional-deps.mjs';
import {
  cliSupportName,
  cliSupportOs,
} from '../../../utils/publish-cli-support.mjs';
import { platforms } from '../../vc-native/scripts/platforms.mjs';

const execFileAsync = promisify(execFile);
const nativeRoot = resolve(
  fileURLToPath(new URL('../../vc-native', import.meta.url))
);
const stagedRoot = join(nativeRoot, 'dist-native');

const vercelTarball = resolve(requiredArg('--vercel-tarball'));
const outDir = resolve(requiredArg('--out'));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'vc-native-install-check-'));

try {
  await execFileAsync('tar', ['-xzf', vercelTarball, '-C', work]);
  const vercelDir = join(work, 'package');
  const manifestPath = join(vercelDir, 'package.json');
  const { version } = JSON.parse(await readFile(manifestPath, 'utf8'));

  await injectNativeOptionalDeps({
    cliPackageJsonPath: manifestPath,
    skipNativeDeps: false,
    includeCliSupport: true,
    isPublished: async () => false,
  });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.dependencies;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await pack(vercelDir);

  await execFileAsync(
    process.execPath,
    [join(nativeRoot, 'scripts', 'stage-packages.mjs'), '--allow-missing'],
    { env: { ...process.env, VERCEL_VC_NATIVE_VERSION: version } }
  );

  for (const platform of platforms) {
    const stagedDir = join(stagedRoot, platform.name.replace('@vercel/', ''));
    if (await exists(join(stagedDir, 'package.json'))) {
      console.log(`native: ${platform.name}@${version}`);
      await pack(stagedDir);
      continue;
    }
    await packStandIn({
      name: platform.name,
      version,
      description: 'install-check stand-in without a binary',
      os: platform.os,
      cpu: platform.cpu,
      ...(platform.libc ? { libc: platform.libc } : {}),
    });
  }

  // `vercel` also pins @vercel/cli-support as an optionalDependency. Its OS
  // restriction excludes every host this check runs on, but yarn 1 still
  // resolves it and fails if the registry does not have it.
  await packStandIn({
    name: cliSupportName,
    version,
    description: 'install-check stand-in for the JavaScript CLI fallback',
    os: cliSupportOs,
  });
} finally {
  await rm(work, { recursive: true, force: true });
}

async function packStandIn(manifest) {
  const stubDir = join(work, 'stubs', manifest.name.replace('@vercel/', ''));
  await mkdir(stubDir, { recursive: true });
  await writeFile(
    join(stubDir, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log(`stand-in: ${manifest.name}@${manifest.version}`);
  await pack(stubDir);
}

async function pack(dir) {
  await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--silent', '--pack-destination', outDir],
    { cwd: dir }
  );
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}
