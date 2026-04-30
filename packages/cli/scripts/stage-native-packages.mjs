import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const cliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8'));
const nativeRoot = join(cliRoot, 'native-packages');
const distBinDir = join(cliRoot, 'dist-bin');

const platforms = [
  {
    packageDir: 'cli-darwin-arm64',
    packageName: '@vercel/cli-darwin-arm64',
    asset: 'vercel-darwin-arm64',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-darwin-x64',
    packageName: '@vercel/cli-darwin-x64',
    asset: 'vercel-darwin-x64',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-linux-arm64',
    packageName: '@vercel/cli-linux-arm64',
    asset: 'vercel-linux-arm64',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-linux-x64',
    packageName: '@vercel/cli-linux-x64',
    asset: 'vercel-linux-x64',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-linux-arm64-musl',
    packageName: '@vercel/cli-linux-arm64-musl',
    asset: 'vercel-linux-arm64-musl',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-linux-x64-musl',
    packageName: '@vercel/cli-linux-x64-musl',
    asset: 'vercel-linux-x64-musl',
    binary: 'vercel',
  },
  {
    packageDir: 'cli-windows-arm64',
    packageName: '@vercel/cli-windows-arm64',
    asset: 'vercel-windows-arm64.exe',
    binary: 'vercel.exe',
  },
  {
    packageDir: 'cli-windows-x64',
    packageName: '@vercel/cli-windows-x64',
    asset: 'vercel-windows-x64.exe',
    binary: 'vercel.exe',
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

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

for (const platform of platforms) {
  const packageDir = join(nativeRoot, platform.packageDir);
  const packageJsonPath = join(packageDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = cliPkg.version;
  writeJson(packageJsonPath, packageJson);

  const source = join(distBinDir, platform.asset);
  const targetDir = join(packageDir, 'bin');
  const target = join(targetDir, platform.binary);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, target);
  if (platform.binary !== 'vercel.exe') {
    chmodSync(target, 0o755);
  }
  console.log(`[native-package] staged ${platform.packageName}@${cliPkg.version}`);
}

{
  const packageJsonPath = join(nativeRoot, 'cli-native', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = cliPkg.version;
  packageJson.optionalDependencies = optionalDependencies;
  writeJson(packageJsonPath, packageJson);
  console.log(`[native-package] staged @vercel/cli-native@${cliPkg.version}`);
}
