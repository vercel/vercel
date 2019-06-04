import { tmpdir } from 'os';
import pipe from 'promisepipe';
import { dirname, join } from 'path';
import { createWriteStream, mkdirp, symlink, unlink } from 'fs-extra';
import streamToPromise from 'stream-to-promise';
import {
  Entry,
  ZipFile,
  open as zipFromFile,
  fromBuffer as zipFromBuffer,
} from 'yauzl-promise';

export { zipFromFile, zipFromBuffer, ZipFile };

export async function unzipToTemp(
  data: Buffer | string,
  tmpDir: string = tmpdir()
): Promise<string> {
  const dir = join(
    tmpDir,
    `zeit-fun-${Math.random()
      .toString(16)
      .substring(2)}`
  );
  let zip: ZipFile;
  if (Buffer.isBuffer(data)) {
    zip = await zipFromBuffer(data);
  } else {
    zip = await zipFromFile(data);
  }
  await unzip(zip, dir);
  await zip.close();
  return dir;
}

interface UnzipOptions {
  strip?: number;
}

export async function unzip(
  zipFile: ZipFile,
  dir: string,
  opts: UnzipOptions = {}
): Promise<void> {
  let entry: Entry;
  const strip = opts.strip || 0;
  while ((entry = await zipFile.readEntry()) !== null) {
    const fileName =
      strip === 0
        ? entry.fileName
        : entry.fileName
            .split('/')
            .slice(strip)
            .join('/');
    const destPath = join(dir, fileName);
    if (/\/$/.test(entry.fileName)) {
      await mkdirp(destPath);
    } else {
      const [entryStream] = await Promise.all([
        entry.openReadStream(),
        // ensure parent directory exists
        mkdirp(dirname(destPath)),
      ]);
      const mode = entry.externalFileAttributes >>> 16;
      if (isSymbolicLink(mode)) {
        const linkDest = String(await streamToPromise(entryStream));
        await symlink(linkDest, destPath);
      } else {
        const octal = mode & 4095 /* 07777 */;
        const modeOctal = ('0000' + octal.toString(8)).slice(-4);
        const modeVal = parseInt(modeOctal, 8);
        try {
          await unlink(destPath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
        }
        const destStream = createWriteStream(destPath, {
          mode: modeVal,
        });
        await pipe(
          entryStream,
          destStream
        );
      }
    }
  }
}

const S_IFMT = 61440; /* 0170000 type of file */
const S_IFLNK = 40960; /* 0120000 symbolic link */

export function isSymbolicLink(mode: number): boolean {
  return (mode & S_IFMT) === S_IFLNK;
}
