import { dirname, join, relative } from 'node:path';
import { rename } from 'node:fs/promises';
import { isErrnoException } from '@vercel/error-utils';
import { stat, mkdirp, move, remove, rmdir, readdir } from 'fs-extra';
import type { Stats } from 'fs-extra';

type IgnoreFilter = (path: string) => boolean;

/**
 * Serializes all merges in this process so parallel builds writing to the
 * same destination never interleave.
 */
let mergeQueue: Promise<unknown> = Promise.resolve();

/**
 * Merge a directory into another directory. A `move` file operation is
 * preferred, falling back to a recursive `move` of contents within the
 * source directory. Calls are serialized process-wide via `mergeQueue`.
 */
export function merge(
  source: string,
  destination: string,
  ignoreFilter?: IgnoreFilter,
  sourceRoot?: string
): Promise<void> {
  const run = () => mergeImpl(source, destination, ignoreFilter, sourceRoot);
  const result = mergeQueue.then(run, run);
  // Keep the chain alive for the next caller regardless of this outcome.
  mergeQueue = result.catch(() => {});
  return result;
}

async function mergeImpl(
  source: string,
  destination: string,
  ignoreFilter?: IgnoreFilter,
  sourceRoot?: string
): Promise<void> {
  const root = sourceRoot || source;

  if (ignoreFilter) {
    const relPath = relative(root, source);
    if (relPath && !ignoreFilter(relPath)) {
      await remove(source);
      return;
    }
  }

  const destStat: Stats | NodeJS.ErrnoException = await stat(destination).catch(
    err => err
  );
  if (isErrnoException(destStat)) {
    if (destStat.code === 'ENOENT') {
      await publishNew(source, destination, ignoreFilter, root);
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
        contents.map(name =>
          mergeImpl(
            join(source, name),
            join(destination, name),
            ignoreFilter,
            root
          )
        )
      );
      // Source should be empty at this point
      await rmdir(source);
      return;
    }
  }

  // Destination exists and replacing it is intended (a file, or a directory
  // being overwritten by a file).
  await overwrite(source, destination, ignoreFilter, root);
}

/**
 * Publish `source` at a `destination` that did not exist when it was checked,
 * using a single atomic `rename`. If a directory materialized at
 * `destination` anyway, fall back to merging contents into it.
 */
async function publishNew(
  source: string,
  destination: string,
  ignoreFilter: IgnoreFilter | undefined,
  root: string
): Promise<void> {
  let renameError: unknown;
  try {
    try {
      await rename(source, destination);
      return;
    } catch (err) {
      // The destination's parent may not exist yet.
      if (isErrnoException(err) && err.code === 'ENOENT') {
        await mkdirp(dirname(destination));
        await rename(source, destination);
        return;
      }
      throw err;
    }
  } catch (err) {
    renameError = err;
  }

  if (isErrnoException(renameError) && renameError.code === 'EXDEV') {
    // Different filesystem: copy into a process-private sibling of the
    // destination first, so a partial copy is never visible, then publish it
    // with a same-filesystem rename.
    const tmp = tmpName(destination);
    try {
      await move(source, tmp);
    } catch (err) {
      await remove(tmp).catch(() => undefined);
      throw err;
    }

    try {
      await rename(tmp, destination);
    } catch {
      // The destination materialized anyway, so we can merge the copied tree into it
      const relPrefix = relative(root, source);
      try {
        await mergeImpl(
          tmp,
          destination,
          ignoreFilter && (path => ignoreFilter(join(relPrefix, path))),
          tmp
        );
      } catch (err) {
        await remove(tmp).catch(() => undefined);
        throw err;
      }
    }
    return;
  }

  // For any other rename failure if the destination materialized anyway,
  // merge into it, otherwise rethrow.
  const destinationAppeared = await stat(destination).then(
    () => true,
    () => false
  );
  if (!destinationAppeared) {
    throw renameError;
  }
  await mergeImpl(source, destination, ignoreFilter, root);
}

/**
 * Replace an existing `destination` with `source`, by staging `source` at a
 * process-private sibling and then publishing it with a single atomic `rename`.
 */
async function overwrite(
  source: string,
  destination: string,
  ignoreFilter: IgnoreFilter | undefined,
  root: string
): Promise<void> {
  const tmp = tmpName(destination);
  try {
    await move(source, tmp);
  } catch (err) {
    await remove(tmp).catch(() => undefined);
    throw err;
  }

  try {
    await rename(tmp, destination);
    return;
  } catch {
    // Cannot replace in one step, so will try non-atomic path.
  }

  try {
    await remove(destination);
    await rename(tmp, destination);
  } catch {
    // The destination materialized between remove and rename, so `tmp`
    // now holds the only copy of the source data and we can merge it
    // into the destination.
    const relPrefix = relative(root, source);
    try {
      await mergeImpl(
        tmp,
        destination,
        ignoreFilter && (path => ignoreFilter(join(relPrefix, path))),
        tmp
      );
    } catch (err) {
      await remove(tmp).catch(() => undefined);
      throw err;
    }
  }
}

function tmpName(destination: string): string {
  return `${destination}.tmp-${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
