import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import type { PackageJson } from '../types';

export interface FindPackageJsonResult {
  /**
   * The file path of found `package.json` file, or `undefined` if not found.
   */
  packageJsonPath?: string;
  /**
   * The contents of found `package.json` file, when the `readPackageJson`
   * option is enabled.
   */
  packageJson?: PackageJson;
}

export interface TraverseUpDirectoriesProps {
  /**
   * The directory to start iterating from, typically the same directory of the entrypoint.
   */
  start: string;
  /**
   * The highest directory, typically the workPath root of the project.
   */
  base?: string;
}

export interface WalkParentDirsProps
  extends Required<TraverseUpDirectoriesProps> {
  /**
   * The name of the file to search for, typically `package.json` or `Gemfile`.
   */
  filename: string;
}

export function* traverseUpDirectories({
  start,
  base,
}: TraverseUpDirectoriesProps) {
  let current: string | undefined = path.normalize(start);
  const normalizedRoot = base ? path.normalize(base) : undefined;
  while (current) {
    yield current;
    if (current === normalizedRoot) break;
    // Go up one directory
    const next = path.join(current, '..');
    current = next === current ? undefined : next;
  }
}

/**
 * Traverses up directories to find and optionally read package.json.
 * This is a lightweight alternative to `scanParentDirs` when only
 * package.json information is needed (without lockfile detection).
 */
export async function findPackageJson(
  destPath: string,
  readPackageJson = false,
  base = '/'
): Promise<FindPackageJsonResult> {
  assert(path.isAbsolute(destPath));

  const pkgJsonPath = await walkParentDirs({
    base,
    start: destPath,
    filename: 'package.json',
  });

  let packageJson: PackageJson | undefined;
  if (readPackageJson && pkgJsonPath) {
    try {
      packageJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
    } catch (err) {
      throw new Error(
        `Could not read ${pkgJsonPath}: ${(err as Error).message}.`
      );
    }
  }

  return {
    packageJsonPath: pkgJsonPath || undefined,
    packageJson,
  };
}

export async function walkParentDirs({
  base,
  start,
  filename,
}: WalkParentDirsProps): Promise<string | null> {
  assert(path.isAbsolute(base), 'Expected "base" to be absolute path');
  assert(path.isAbsolute(start), 'Expected "start" to be absolute path');

  for (const dir of traverseUpDirectories({ start, base })) {
    const fullPath = path.join(dir, filename);

    if (await fs.pathExists(fullPath)) {
      return fullPath;
    }
  }

  return null;
}
