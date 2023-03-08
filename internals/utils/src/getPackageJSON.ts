import fs from 'fs';
import { PackageJson } from '@vercel/build-utils';

export const getPackageJSON = (packageJSONPath: string): PackageJson => JSON.parse(
  fs.readFileSync(packageJSONPath, 'utf8')
);
