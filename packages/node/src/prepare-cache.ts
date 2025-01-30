import {
  defaultCacheDirGlob,
  glob,
  type PrepareCache,
} from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCacheDirGlob, repoRootPath || workPath);
};
