// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import fs from 'fs';
import type { Files } from '@vercel/build-utils';

// Cache promises to ensure parallel calls for the same path share the same I/O operation
const fileSizeCache = new Map<string, Promise<number>>();

const getFileSize = (path: string | undefined): Promise<number> => {
  if (!path) return Promise.resolve(0);

  const cached = fileSizeCache.get(path);
  if (cached) {
    return cached;
  }

  const promise = fs.promises.lstat(path).then(stats => stats.size);
  fileSizeCache.set(path, promise);

  return promise;
};

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

      if (files[fileKey].type === 'FileBlob') {
        size += files[fileKey].data.length;
      } else if (files[fileKey].type === 'FileFsRef') {
        const curSize =
          files[fileKey].size ?? (await getFileSize(files[fileKey].fsPath));
        size += curSize;
      }
    })
  );
  return size;
};
