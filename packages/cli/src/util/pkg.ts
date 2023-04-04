import { getPackageJSON } from '@vercel-internals/utils';

export default getPackageJSON() as typeof import('../../package.json');
