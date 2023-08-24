import { stat } from 'fs-extra';

/**
 * Returns `true` if "path" is a directory on the filesystem.
 * Returns `false` if "path" does not exist or is a file.
 */
export async function isDirectoryPath(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir);
    return s.isDirectory();
  } catch (err) {
    if ((err as undefined | { code: string })?.code !== 'ENOENT') {
      throw err;
    }
  }
  return false;
}
