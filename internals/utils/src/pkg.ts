import { readFileSync } from 'fs';
import { join } from 'path';
import { PackageJson } from '@vercel/build-utils';

const pkgPath = join(__dirname, '../../../packages/cli/package.json');
const pkg: PackageJson & typeof import('../../../packages/cli/package.json') =
  JSON.parse(readFileSync(pkgPath, 'utf8'));
export default pkg;
