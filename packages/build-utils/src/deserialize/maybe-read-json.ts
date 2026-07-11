import { readJSON } from 'fs-extra';

/**
 * Reads the JSON file at `path`.
 * Returns `undefined` if the file does not exist.
 */
export async function maybeReadJSON<T = any>(
  path: string
): Promise<T | undefined> {
  try {
    return await readJSON(path);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  return undefined;
}
