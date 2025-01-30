import { glob } from '@vercel/build-utils';
import type { PrepareCache } from '@vercel/build-utils';
import { defaultCachePathGlob } from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
