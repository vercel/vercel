import { glob } from '@vercel/build-utils';
import type { PrepareCache } from '@vercel/build-utils';
import { defaultCacheDirGlob } from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCacheDirGlob, repoRootPath || workPath);
};
