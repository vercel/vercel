import { getPackageJSON } from '@vercel-internals/get-package-json';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export default getPackageJSON() as typeof import('../../package.json');
