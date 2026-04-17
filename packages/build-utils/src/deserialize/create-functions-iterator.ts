import { join, relative } from 'path';
import { readdir, stat } from 'fs-extra';

const SUFFIX = '.func';

/**
 * Creates an async iterator that scans a directory for sub-directories
 * that end with the suffix `.func`.
 *
 * @param dir Absolute path to scan for `.func` directories
 * @param root The root directory from where the scanning started
 */
export async function* createFunctionsIterator(
  dir: string,
  root = dir
): AsyncIterable<string> {
  let paths: string[];
  try {
    paths = await readdir(dir);
  } catch (err: any) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      throw err;
    }
    paths = [];
  }
  for (const path of paths) {
    const abs = join(dir, path);
    const s = await stat(abs);
    if (s.isDirectory()) {
      if (path.endsWith(SUFFIX)) {
        yield relative(root, abs.substring(0, abs.length - SUFFIX.length));
      } else {
        yield* createFunctionsIterator(abs, root);
      }
    }
  }
}
