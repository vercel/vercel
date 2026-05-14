import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '..', '..');
const cliRoot = join(repoRoot, 'packages', 'cli');
const cliPackageJson = JSON.parse(
  await readFile(join(cliRoot, 'package.json'), 'utf8')
);
const version = process.env.VERCEL_VC_NATIVE_VERSION ?? cliPackageJson.version;
const outputRoot = join(packageRoot, 'dist-native');
const binaryRoot = join(cliRoot, 'dist-bin');
const checkSourcesOnly = process.argv.includes('--check-sources');
const allowMissing = process.argv.includes('--allow-missing');

const platforms = [
  {
    name: '@vercel/vc-native-darwin-arm64',
    asset: 'vercel-darwin-arm64',
    os: ['darwin'],
    cpu: ['arm64'],
  },
  {
    name: '@vercel/vc-native-darwin-x64',
    asset: 'vercel-darwin-x64',
    os: ['darwin'],
    cpu: ['x64'],
  },
  {
    name: '@vercel/vc-native-linux-arm64',
    asset: 'vercel-linux-arm64',
    os: ['linux'],
    cpu: ['arm64'],
  },
  {
    name: '@vercel/vc-native-linux-x64',
    asset: 'vercel-linux-x64',
    os: ['linux'],
    cpu: ['x64'],
  },
  {
    name: '@vercel/vc-native-win32-x64',
    asset: 'vercel-windows-x64.exe',
    os: ['win32'],
    cpu: ['x64'],
    binary: 'vercel.exe',
  },
];

if (checkSourcesOnly) {
  await stat(join(packageRoot, 'bin', 'vercel'));
  await stat(join(packageRoot, 'scripts', 'stage-packages.mjs'));
  process.exit(0);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const packageDirs = [];
const stagedPlatforms = [];

for (const platform of platforms) {
  const packageDir = join(outputRoot, platform.name.replace('@vercel/', ''));
  const binDir = join(packageDir, 'bin');
  const binaryName = platform.binary ?? 'vercel';
  const sourceBinary = join(binaryRoot, platform.asset);
  const targetBinary = join(binDir, binaryName);

  try {
    await stat(sourceBinary);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') {
      console.warn(`Skipping ${platform.name}: missing ${sourceBinary}`);
      continue;
    }
    throw error;
  }

  await mkdir(binDir, { recursive: true });
  await copyFile(sourceBinary, targetBinary);
  await chmod(targetBinary, 0o755);
  await writePackageJson(packageDir, {
    name: platform.name,
    version,
    description: `Native Vercel CLI binary for ${platform.os[0]} ${platform.cpu[0]}`,
    license: 'Apache-2.0',
    homepage: 'https://vercel.com',
    repository: repository('packages/vc-native'),
    os: platform.os,
    cpu: platform.cpu,
    bin: {
      vercel: `./bin/${binaryName}`,
      vc: `./bin/${binaryName}`,
    },
    files: ['bin'],
    publishConfig: { access: 'public' },
  });
  packageDirs.push(packageDir);
  stagedPlatforms.push(platform);
}

const wrapperDir = join(outputRoot, 'vc-native');
await mkdir(join(wrapperDir, 'bin'), { recursive: true });
await copyFile(
  join(packageRoot, 'bin', 'vercel'),
  join(wrapperDir, 'bin', 'vercel')
);
await chmod(join(wrapperDir, 'bin', 'vercel'), 0o755);
await writePackageJson(wrapperDir, {
  name: '@vercel/vc-native',
  version,
  description: 'Native Vercel CLI installer for npm',
  license: 'Apache-2.0',
  homepage: 'https://vercel.com',
  repository: repository('packages/vc-native'),
  bin: {
    vercel: './bin/vercel',
    vc: './bin/vercel',
  },
  optionalDependencies: Object.fromEntries(
    stagedPlatforms.map(platform => [platform.name, version])
  ),
  files: ['bin'],
  publishConfig: { access: 'public' },
});
packageDirs.push(wrapperDir);

console.log(packageDirs.join('\n'));

async function writePackageJson(packageDir, manifest) {
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
}

function repository(directory) {
  return {
    type: 'git',
    url: 'git+https://github.com/vercel/vercel.git',
    directory,
  };
}
