import fs from 'fs';
import { spawnSync } from 'child_process';

const packagesDir = new URL('../packages/', import.meta.url);

for (const name of fs.readdirSync(packagesDir)) {
  const pkg = JSON.parse(
    fs.readFileSync(new URL(`${name}/package.json`, packagesDir), 'utf8')
  );
  spawnSync(
    'npm',
    `dist-tag add ${pkg.name}@${pkg.version} canary`.split(' '),
    { stdio: 'inherit' }
  );
}
