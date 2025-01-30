import { defaultCachePath, glob, type PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePath, repoRootPath || workPath);
};
