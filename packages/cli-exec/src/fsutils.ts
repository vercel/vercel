import type { Stats } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { getErrorMessage, isMissingPathError } from './errutils';

/**
 * Result of reading filesystem metadata for a path that may not exist.
 */
type MaybeStatsResult =
  | { stats: Stats }
  | { missing: true }
  | { reason: string };

/**
 * Resolves a path through symlinks, falling back to the original path on miss.
 */
export async function getCanonicalPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Returns the inclusive directory chain from `parent` to `child`.
 */
export function getDirectoriesBetween(parent: string, child: string): string[] {
  const directories = [];
  let current = path.resolve(child);
  const resolvedParent = path.resolve(parent);

  while (true) {
    directories.push(current);

    if (current === resolvedParent) {
      return directories.reverse();
    }

    const next = path.dirname(current);
    if (next === current) {
      return [];
    }

    current = next;
  }
}

/**
 * Reads stat metadata while distinguishing absent paths from inspection errors.
 */
export async function statIfExists(
  filePath: string
): Promise<MaybeStatsResult> {
  try {
    return { stats: await stat(filePath) };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { missing: true };
    }

    return { reason: `could not inspect: ${getErrorMessage(error)}` };
  }
}

/**
 * Returns whether a resolved executable should be invoked through Node.
 */
export function isNodeScript(filePath: string): boolean {
  return ['.js', '.cjs', '.mjs'].includes(path.extname(filePath));
}

/**
 * Returns whether `child` is equal to or nested below `parent`.
 */
export function isSubpath(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);

  return (
    relativePath === '' ||
    (relativePath !== '' &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

/**
 * Strips Windows executable extensions before matching package bin names.
 */
export function getCommandBase(command: string): string {
  const extension = path.extname(command).toLowerCase();

  if (process.platform === 'win32' && ['.cmd', '.exe'].includes(extension)) {
    return path.basename(command, extension);
  }

  return path.basename(command);
}
