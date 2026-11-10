// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import { readFile } from 'node:fs/promises';

/**
 * Reads the JSON file at `path`.
 * Returns `undefined` if the file does not exist.
 */
export async function maybeReadJSON<T = any>(
  path: string
): Promise<T | undefined> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    return undefined;
  }
  try {
    return JSON.parse(
      contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents
    );
  } catch (err: any) {
    err.message = `${path}: ${err.message}`;
    throw err;
  }
}
