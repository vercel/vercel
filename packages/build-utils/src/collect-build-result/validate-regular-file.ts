import type FileFsRef from '../file-fs-ref';
import { NowBuildError } from '../errors';
import { lstat, type Stats } from 'fs-extra';

interface FileLike {
  fsPath?: string;
}

export async function validateRegularFile(file: FileFsRef): Promise<Stats>;
export async function validateRegularFile<T extends object>(
  file: FileLike | T
): Promise<Stats | null>;
export async function validateRegularFile<T extends object>(
  file: FileLike | T
): Promise<Stats | null> {
  if ('fsPath' in file && typeof file.fsPath === 'string') {
    /**
     * Give explicit error messages for exotic artifacts in the output folder.
     * Note: use `lstat`! because symbolic links matter here and we don't want to follow them
     */
    const stat = await lstat(file.fsPath);
    if (!stat.isFile() && !stat.isDirectory() && !stat.isSymbolicLink()) {
      /**
       * fifo, block device, character device, socket, something else
       */
      throw new NowBuildError({
        message: `Output file path is actually not a (regular) file: \`${file.fsPath}\``,
        code: 'OUTPUT_FILE_IS_NOT_REGULAR_FILE',
      });
    }
    return stat;
  }
  return null;
}
