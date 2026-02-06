import { PackageJson } from '@vercel/build-utils';
import { constants, promises as fs, PathLike } from 'fs';
import path from 'path';

export type ImagesConfig = {
  domains: string[];
  sizes: number[];
};

export type BuildConfig = {
  cache: string[];
};

export type DeepWriteable<T> = {
  -readonly [P in keyof T]: DeepWriteable<T[P]>;
};

export async function fileExists(path: PathLike): Promise<boolean> {
  return fs.access(path, constants.F_OK).then(
    () => true,
    () => false
  );
}

/**
 * Read package.json from files
 */
export async function readPackageJson(entryPath: string): Promise<PackageJson> {
  const packagePath = path.join(entryPath, 'package.json');

  try {
    return JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch (_err) {
    return {};
  }
}

/**
 * Write package.json
 */
export async function writePackageJson(
  workPath: string,
  packageJson: PackageJson
) {
  await fs.writeFile(
    path.join(workPath, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
}

export function isObjectEmpty(object: { [key: string]: unknown }) {
  for (const _prop in object) {
    return false;
  }

  return true;
}
