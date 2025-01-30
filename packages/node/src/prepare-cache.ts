import {
  defaultCachePathGlob,
  glob,
  type PrepareCache,
} from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
