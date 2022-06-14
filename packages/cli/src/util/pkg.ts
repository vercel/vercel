import fs from 'fs';
import { join } from 'path';
import { PackageJson } from '@vercel/build-utils';

// Path here has only one `..` because the ncc'd file lives in "dist"
const pkgPath = join(__dirname, '../package.json');

const pkg: PackageJson & typeof import('../../package.json') = JSON.parse(
  fs.readFileSync(pkgPath, 'utf8')
);
export default pkg;
