import { getPackageJSON } from '@vercel-internals/get-package-json';

export default getPackageJSON() as typeof import('../../package.json');
