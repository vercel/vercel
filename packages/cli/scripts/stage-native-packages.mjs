import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = dirname(
  fileURLToPath(new URL('../package.json', import.meta.url))
);
const cliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8'));
const nativeRoot = join(cliRoot, 'dist-native-packages');
const distBinDir = join(cliRoot, 'dist-bin');

const platforms = [
  {
    packageDir: 'cli-darwin-arm64',
    packageName: '@vercel/cli-darwin-arm64',
    asset: 'vercel-darwin-arm64',
    binary: 'vercel',
    os: 'darwin',
    cpu: 'arm64',
  },
  {
    packageDir: 'cli-darwin-x64',
    packageName: '@vercel/cli-darwin-x64',
    asset: 'vercel-darwin-x64',
    binary: 'vercel',
    os: 'darwin',
    cpu: 'x64',
  },
  {
    packageDir: 'cli-linux-arm64',
    packageName: '@vercel/cli-linux-arm64',
    asset: 'vercel-linux-arm64',
    binary: 'vercel',
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
  },
  {
    packageDir: 'cli-linux-x64',
    packageName: '@vercel/cli-linux-x64',
    asset: 'vercel-linux-x64',
    binary: 'vercel',
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
  },
  {
    packageDir: 'cli-linux-arm64-musl',
    packageName: '@vercel/cli-linux-arm64-musl',
    asset: 'vercel-linux-arm64-musl',
    binary: 'vercel',
    os: 'linux',
    cpu: 'arm64',
    libc: 'musl',
  },
  {
    packageDir: 'cli-linux-x64-musl',
    packageName: '@vercel/cli-linux-x64-musl',
    asset: 'vercel-linux-x64-musl',
    binary: 'vercel',
    os: 'linux',
    cpu: 'x64',
    libc: 'musl',
  },
  {
    packageDir: 'cli-windows-arm64',
    packageName: '@vercel/cli-windows-arm64',
    asset: 'vercel-windows-arm64.exe',
    binary: 'vercel.exe',
    os: 'win32',
    cpu: 'arm64',
  },
  {
    packageDir: 'cli-windows-x64',
    packageName: '@vercel/cli-windows-x64',
    asset: 'vercel-windows-x64.exe',
    binary: 'vercel.exe',
    os: 'win32',
    cpu: 'x64',
  },
];

const optionalDependencies = Object.fromEntries(
  platforms.map(platform => [platform.packageName, cliPkg.version])
);

const missingAssets = platforms
  .map(platform => join(distBinDir, platform.asset))
  .filter(asset => !existsSync(asset));

if (missingAssets.length > 0) {
  console.error('[native-package] missing binary assets:');
  for (const asset of missingAssets) {
    console.error(`- ${asset}`);
  }
  process.exit(1);
}

rmSync(nativeRoot, { recursive: true, force: true });

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function commonPackageJson(platform) {
  const packageJson = {
    name: platform.packageName,
    version: cliPkg.version,
    description: `Opt-in native Vercel CLI binary for ${platform.os} ${platform.cpu}.`,
    license: cliPkg.license,
    repository: cliPkg.repository,
    os: [platform.os],
    cpu: [platform.cpu],
    files: ['bin'],
    bin: {
      'vercel-native': `bin/${platform.binary}`,
      vcn: `bin/${platform.binary}`,
    },
    publishConfig: {
      access: 'public',
    },
  };

  if (platform.libc) {
    packageJson.libc = [platform.libc];
  }

  return packageJson;
}

for (const platform of platforms) {
  const packageDir = join(nativeRoot, platform.packageDir);
  const packageJsonPath = join(packageDir, 'package.json');

  const source = join(distBinDir, platform.asset);
  const targetDir = join(packageDir, 'bin');
  const target = join(targetDir, platform.binary);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, target);
  if (platform.binary !== 'vercel.exe') {
    chmodSync(target, 0o755);
  }
  writeJson(packageJsonPath, commonPackageJson(platform));
  console.log(
    `[native-package] staged ${platform.packageName}@${cliPkg.version}`
  );
}

{
  const packageDir = join(nativeRoot, 'cli-native');
  const binDir = join(packageDir, 'bin');
  mkdirSync(binDir, { recursive: true });

  writeFileSync(
    join(binDir, 'vercel.js'),
    `#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { spawn } = require('node:child_process');

function isMusl() {
  if (process.platform !== 'linux') return false;
  const report = process.report && process.report.getReport && process.report.getReport();
  return !report?.header?.glibcVersionRuntime;
}

function packageName() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return '@vercel/cli-darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return '@vercel/cli-darwin-x64';
  if (platform === 'win32' && arch === 'arm64') return '@vercel/cli-windows-arm64';
  if (platform === 'win32' && arch === 'x64') return '@vercel/cli-windows-x64';
  if (platform === 'linux' && arch === 'arm64') return isMusl() ? '@vercel/cli-linux-arm64-musl' : '@vercel/cli-linux-arm64';
  if (platform === 'linux' && arch === 'x64') return isMusl() ? '@vercel/cli-linux-x64-musl' : '@vercel/cli-linux-x64';
  return null;
}

const selectedPackage = packageName();
if (!selectedPackage) {
  console.error(\`Unsupported platform for @vercel/cli-native: \${process.platform} \${process.arch}\`);
  process.exit(1);
}

let packageJsonPath;
try {
  packageJsonPath = require.resolve(\`\${selectedPackage}/package.json\`);
} catch (error) {
  console.error(\`Missing native Vercel CLI package: \${selectedPackage}\`);
  console.error('Reinstall @vercel/cli-native, or install the platform package directly.');
  process.exit(1);
}

const binary = join(dirname(packageJsonPath), 'bin', process.platform === 'win32' ? 'vercel.exe' : 'vercel');
if (!existsSync(binary)) {
  console.error(\`Native Vercel CLI binary was not found: \${binary}\`);
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });
child.on('error', error => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
`,
    { mode: 0o755 }
  );

  const packageJsonPath = join(packageDir, 'package.json');
  const packageJson = {
    name: '@vercel/cli-native',
    version: cliPkg.version,
    description: 'Opt-in native Vercel CLI launcher.',
    license: cliPkg.license,
    repository: cliPkg.repository,
    files: ['bin'],
    bin: {
      'vercel-native': 'bin/vercel.js',
      vcn: 'bin/vercel.js',
    },
    optionalDependencies,
    publishConfig: {
      access: 'public',
    },
  };
  writeJson(packageJsonPath, packageJson);
  console.log(`[native-package] staged @vercel/cli-native@${cliPkg.version}`);
}
