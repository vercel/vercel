import { spawnSync } from 'child_process';
import fs from 'fs';

const packagesDir = new URL('../packages/', import.meta.url);
const ignoredPackages = [];

for (const name of fs.readdirSync(packagesDir)) {
  if (ignoredPackages.includes(name)) {
    continue;
  }

  const pkg = JSON.parse(
    fs.readFileSync(new URL(`${name}/package.json`, packagesDir), 'utf8')
  );
  spawnSync(
    'pnpm',
    `dist-tag add ${pkg.name}@${pkg.version} canary`.split(' '),
    { stdio: 'inherit' }
  );
}
