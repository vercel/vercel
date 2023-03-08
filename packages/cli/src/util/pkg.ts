import { join } from 'path';
import { getPackageJSON } from '@vercel-internals/utils';

const pkgPath = join(__dirname, '..', '..', 'package.json');

export default getPackageJSON(pkgPath) as ReturnType<typeof getPackageJSON> &
  typeof import('../../package.json');
