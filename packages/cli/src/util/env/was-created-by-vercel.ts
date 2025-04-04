import { closeSync, openSync, readSync } from 'fs';
import { isErrnoException } from '@vercel/error-utils';
import { CONTENTS_PREFIX } from './constants';

function readHeadSync(path: string, length: number) {
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, null);
  } finally {
    closeSync(fd);
  }
  return buffer.toString();
}

function tryReadHeadSync(path: string, length: number) {
  try {
    return readHeadSync(path, length);
  } catch (err: unknown) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Returns true if the file was created by Vercel CLI and undefined if it does
 * not exist.
 */
export async function wasCreatedByVercel(
  path: string
): Promise<boolean | undefined> {
  const head = tryReadHeadSync(path, Buffer.byteLength(CONTENTS_PREFIX));
  if (head === undefined) return undefined;
  return head === CONTENTS_PREFIX;
}
