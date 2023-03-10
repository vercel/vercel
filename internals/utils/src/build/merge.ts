import { join } from 'path';
import { isErrnoException } from '@vercel/error-utils';
import { stat, move, remove, rmdir, readdir } from 'fs-extra';
import type { Stats } from 'fs-extra';

/**
 * Merge a directory into another directory. A `move` file operation is preferred,
 * falling back to a recursive `move` of contents within the source directory.
 */
export async function merge(source: string, destination: string) {
  const destStat: Stats | NodeJS.ErrnoException = await stat(destination).catch(
    err => err
  );
  if (isErrnoException(destStat)) {
    if (destStat.code === 'ENOENT') {
      // Destination does not exist, so move directly
      await move(source, destination);
      return;
    }
    // Some other kind of error, bail
    throw destStat;
  } else if (destStat.isDirectory()) {
    // Destination is already a directory, so merge contents recursively
    const contents: string[] | NodeJS.ErrnoException = await readdir(
      source
    ).catch(err => err);
    if (isErrnoException(contents)) {
      // If source is not a directory, then fall through to rm + move
      if (contents.code !== 'ENOTDIR') {
        // Any other error then bail
        throw contents;
      }
    } else {
      await Promise.all(
        contents.map(name => merge(join(source, name), join(destination, name)))
      );
      // Source should be empty at this point
      await rmdir(source);
      return;
    }
  }

  // Destination is not a directory, or dest is a dir + source is not, so overwrite
  await remove(destination);
  await move(source, destination);
}
