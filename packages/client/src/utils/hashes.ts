import { createHash } from 'crypto';
import fs from 'fs-extra';
import { Sema } from 'async-sema';

export interface DeploymentFile {
  names: string[];
  data?: Buffer;
  mode: number;
  /**
   * Byte length of the file's content. Always set for real files; used to send
   * `Content-Length` when a file is streamed (i.e. has no in-memory `data`).
   */
  size?: number;
}

/**
 * Largest file we read fully into memory to hash. `fs.readFile` reads into a
 * single Buffer and throws `ERR_FS_FILE_TOO_LARGE` ("File size ... is greater
 * than 2 GiB") above Node's `kIoMaxLength`, so larger files are hashed — and
 * later uploaded — as streams instead.
 */
const MAX_BUFFER_FILE_SIZE = 2 ** 31 - 1;

export type FilesMap = Map<string | undefined, DeploymentFile>;

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */
export function hash(buf: Buffer): string {
  return createHash('sha1').update(Uint8Array.from(buf)).digest('hex');
}

/**
 * Computes the sha1 digest of a file by streaming it, so files too large to fit
 * in a single Buffer (see {@link MAX_BUFFER_FILE_SIZE}) can still be hashed.
 */
async function hashFile(path: string): Promise<string> {
  const digest = createHash('sha1');
  for await (const chunk of fs.createReadStream(path)) {
    digest.update(Uint8Array.from(chunk as Buffer));
  }
  return digest.digest('hex');
}

/**
 * Transforms map to object
 * @param map with hashed files
 * @return {object}
 */
export const mapToObject = (map: FilesMap): Record<string, DeploymentFile> => {
  const obj: { [key: string]: DeploymentFile } = {};
  for (const [key, value] of map) {
    if (typeof key === 'undefined') continue;
    obj[key] = value;
  }
  return obj;
};

/**
 * Computes hashes for the contents of each file given.
 *
 * @param files - absolute file paths
 * @param map - optional map of files to append
 * @return Map of hash digest to file object
 */
export async function hashes(
  files: string[],
  map = new Map<string | undefined, DeploymentFile>()
): Promise<FilesMap> {
  const semaphore = new Sema(100);

  await Promise.all(
    files.map(async (name: string): Promise<void> => {
      await semaphore.acquire();

      const stat = await fs.lstat(name);
      const mode = stat.mode;

      let data: Buffer | undefined;
      let size: number | undefined;
      const isDirectory = stat.isDirectory();

      let h: string | undefined;

      if (!isDirectory) {
        if (stat.isSymbolicLink()) {
          const link = await fs.readlink(name);
          data = Buffer.from(link, 'utf8');
          size = data.length;
          h = hash(data);
        } else if (stat.size > MAX_BUFFER_FILE_SIZE) {
          // Too large to read into a single Buffer; hash by streaming and leave
          // `data` undefined so the upload streams it from disk as well.
          size = stat.size;
          h = await hashFile(name);
        } else {
          data = await fs.readFile(name);
          size = data.length;
          h = hash(data);
        }
      }

      const entry = map.get(h);

      if (entry) {
        const names = new Set(entry.names);
        names.add(name);
        entry.names = [...names];
      } else {
        map.set(h, { names: [name], data, mode, size });
      }

      semaphore.release();
    })
  );
  return map;
}
