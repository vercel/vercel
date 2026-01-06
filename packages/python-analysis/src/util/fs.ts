import path from 'node:path';

import { readFile } from 'fs-extra';
import { isErrnoException } from './error';

/** Absolute filesystem path. */
export type AbsPath = string;

/** Relative filesystem path. */
export type RelPath = string;

/** Any filesystem path */
export type Path = AbsPath | RelPath;

export async function readFileIfExists(file: Path): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error: unknown) {
    if (!isErrnoException(error, 'ENOENT')) {
      throw error;
    }
  }

  return null;
}

export async function readFileTextIfExists(
  file: Path,
  encoding: BufferEncoding = 'utf8'
): Promise<string | null> {
  const data = await readFileIfExists(file);
  if (data === null) {
    return null;
  } else {
    return data.toString(encoding);
  }
}

export function normalizePath(p: Path): AbsPath {
  let np = path.normalize(p);
  if (np.endsWith(path.sep)) {
    np = np.slice(0, -1);
  }
  return np;
}

/**
 * Check if a path is at or below a parent path in the directory tree.
 *
 * @param somePath - The path to check
 * @param parentPath - The potential parent/ancestor path
 * @returns True if `somePath` is equal to `parentPath` or is a subdirectory
 *          of `parentPath`.
 *
 * @example
 * isSubpath('/a/b/c', '/a/b') // true - c is under b
 * isSubpath('/a/b', '/a/b')   // true - same path
 * isSubpath('/a/b', '/a/b/c') // false - b is above c
 * isSubpath('/a/x', '/a/b')   // false - x is not under b
 */
export function isSubpath(somePath: Path, parentPath: Path): boolean {
  const rel = path.relative(parentPath, somePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
