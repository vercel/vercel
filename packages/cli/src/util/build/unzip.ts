/**
 * Code modified from `extract-zip` to accept Buffer.
 * https://github.com/maxogden/extract-zip/blob/master/index.js
 * BSD-2 Copyright (c) 2014 Max Ogden and other contributors
 */

import path from 'path';
import pipe from 'promisepipe';
import * as fs from 'fs-extra';
import { streamToBuffer } from '@vercel/build-utils';
import { Entry, ZipFile, fromBuffer as zipFromBuffer } from 'yauzl-promise';

async function* createZipIterator(zipFile: ZipFile) {
  let entry: Entry;
  while ((entry = await zipFile.readEntry()) !== null) {
    yield entry;
  }
}

export async function unzip(buffer: Buffer, dir: string): Promise<void> {
  const zipFile = await zipFromBuffer(buffer);
  for await (const entry of createZipIterator(zipFile)) {
    if (entry.fileName.startsWith('__MACOSX/')) continue;

    try {
      const destDir = path.dirname(path.join(dir, entry.fileName));
      await fs.mkdirp(destDir);

      const canonicalDestDir = await fs.realpath(destDir);
      const relativeDestDir = path.relative(dir, canonicalDestDir);

      if (relativeDestDir.split(path.sep).includes('..')) {
        throw new Error(
          `Out of bound path "${canonicalDestDir}" found while processing file ${entry.fileName}`
        );
      }

      await extractEntry(zipFile, entry, dir);
    } catch (err) {
      await zipFile.close();
      throw err;
    }
  }
}

async function extractEntry(
  zipFile: ZipFile,
  entry: Entry,
  dir: string
): Promise<void> {
  const dest = path.join(dir, entry.fileName);

  // convert external file attr int into a fs stat mode int
  const mode = (entry.externalFileAttributes >> 16) & 0xffff;
  // check if it's a symlink or dir (using stat mode constants)
  const IFMT = 61440;
  const IFDIR = 16384;
  const IFLNK = 40960;
  const symlink = (mode & IFMT) === IFLNK;
  let isDir = (mode & IFMT) === IFDIR;

  // Failsafe, borrowed from jsZip
  if (!isDir && entry.fileName.endsWith('/')) {
    isDir = true;
  }

  // check for windows weird way of specifying a directory
  // https://github.com/maxogden/extract-zip/issues/13#issuecomment-154494566
  const madeBy = entry.versionMadeBy >> 8;
  if (!isDir) isDir = madeBy === 0 && entry.externalFileAttributes === 16;

  const procMode = getExtractedMode(mode, isDir) & 0o777;

  // always ensure folders are created
  const destDir = isDir ? dest : path.dirname(dest);

  const mkdirOptions = { recursive: true };
  if (isDir) {
    // @ts-ignore
    mkdirOptions.mode = procMode;
  }
  await fs.mkdir(destDir, mkdirOptions);
  if (isDir) return;

  const readStream = await zipFile.openReadStream(entry);

  if (symlink) {
    const link = await streamToBuffer(readStream);
    await fs.symlink(link.toString('utf8'), dest);
  } else {
    await pipe(readStream, fs.createWriteStream(dest, { mode: procMode }));
  }
}

function getExtractedMode(entryMode: number, isDir: boolean): number {
  let mode = entryMode;

  // Set defaults, if necessary
  if (mode === 0) {
    if (isDir) {
      mode = 0o755;
    } else {
      mode = 0o644;
    }
  }

  return mode;
}
