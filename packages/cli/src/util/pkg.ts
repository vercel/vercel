import fs from 'fs';
import { join } from 'path';
import { PackageJson } from '@vercel/build-utils';

let rootDir = __dirname;
while (!fs.existsSync(join(rootDir, 'package.json'))) {
  rootDir = join(rootDir, '..');
}

const pkgPath = join(rootDir, 'package.json');
const pkg: PackageJson & typeof import('../../package.json') = JSON.parse(
  fs.readFileSync(pkgPath, 'utf8')
);
export default pkg;
