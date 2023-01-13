import { createHash } from 'crypto';
import fs from 'fs-extra';
import { Sema } from 'async-sema';

export interface DeploymentFile {
  names: string[];
  data?: Buffer;
  mode: number;
}

export type FilesMap = Map<string | undefined, DeploymentFile>;

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */
export function hash(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
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
      const isDirectory = stat.isDirectory();

      let h: string | undefined;

      if (!isDirectory) {
        if (stat.isSymbolicLink()) {
          const link = await fs.readlink(name);
          data = Buffer.from(link, 'utf8');
        } else {
          data = await fs.readFile(name);
        }
        h = hash(data);
      }

      const entry = map.get(h);

      if (entry) {
        const names = new Set(entry.names);
        names.add(name);
        entry.names = [...names];
      } else {
        map.set(h, { names: [name], data, mode });
      }

      semaphore.release();
    })
  );
  return map;
}
