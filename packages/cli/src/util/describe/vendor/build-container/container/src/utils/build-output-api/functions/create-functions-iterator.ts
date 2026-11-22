// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import { join, relative } from 'path';
import { readdir, stat } from 'fs/promises';
import type { Dirent } from 'fs';

const SUFFIX = '.func';

export interface FunctionDirEntry {
  /** Whether a `<path>.prerender-config.json` sibling exists. */
  hasPrerenderConfig: boolean;
  /** Whether the `.func` directory entry is a symbolic link. */
  isSymbolicLink: boolean;
  /** Output path of the function (relative to the functions dir, without `.func`). */
  path: string;
}

export async function* createFunctionEntriesIterator(
  dir: string,
  root = dir
): AsyncGenerator<FunctionDirEntry> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if (
      !(typeof error === 'object' && error !== null && 'code' in error) ||
      (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
    ) {
      throw error;
    }
    entries = [];
  }

  let names: Set<string> | undefined;
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const isSymbolicLink = entry.isSymbolicLink();
    if (
      entry.isDirectory() ||
      (isSymbolicLink && (await stat(absolutePath)).isDirectory())
    ) {
      if (entry.name.endsWith(SUFFIX)) {
        names ??= new Set(entries.map(e => e.name));
        const baseName = entry.name.slice(0, -SUFFIX.length);
        yield {
          hasPrerenderConfig: names.has(`${baseName}.prerender-config.json`),
          isSymbolicLink,
          path: relative(
            root,
            absolutePath.substring(0, absolutePath.length - SUFFIX.length)
          ),
        };
      } else {
        yield* createFunctionEntriesIterator(absolutePath, root);
      }
    }
  }
}
