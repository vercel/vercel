import type { Files } from './types';
import { lstat } from 'fs/promises';

// Cache promises to ensure parallel calls for the same path share the same I/O operation
const fileSizeCache = new Map<string, Promise<number>>();

const getFileSize = (path: string | undefined): Promise<number> => {
  if (!path) return Promise.resolve(0);

  const cached = fileSizeCache.get(path);
  if (cached) {
    return cached;
  }

  const promise = lstat(path).then(stats => stats.size);
  fileSizeCache.set(path, promise);

  return promise;
};

/**
 * Collects the total uncompressed size of a set of Lambda files.
 * Handles both FileBlob (in-memory) and FileFsRef (on-disk) file types.
 */
export const collectUncompressedSize = async (
  files: Files,
  ignoreFn?: (fileKey: string) => boolean
) => {
  let size = 0;

  // files should be either FileFsRefs or FileBlob after deserialize
  await Promise.all(
    Object.keys(files).map(async fileKey => {
      if (ignoreFn?.(fileKey)) {
        return;
      }

      const file = files[fileKey];
      if (file.type === 'FileBlob') {
        size += (file as unknown as { data: Buffer }).data.length;
      } else if (file.type === 'FileFsRef') {
        const fsRef = file as unknown as { size?: number; fsPath: string };
        const curSize = fsRef.size ?? (await getFileSize(fsRef.fsPath));
        size += curSize;
      }
    })
  );

  return size;
};
