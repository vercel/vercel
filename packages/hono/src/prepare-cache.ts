import type { PrepareCache } from '@vercel/build-utils';
import { glob, defaultCachePathGlob } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  repoRootPath,
  workPath,
}) => {
  console.log('hono prepare cache');
  console.log(repoRootPath);
  console.log(workPath);
  const result = await glob(defaultCachePathGlob, repoRootPath || workPath);
  console.log(result);
  return result;
};
