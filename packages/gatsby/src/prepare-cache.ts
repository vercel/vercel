import { join, relative } from 'path';
import { glob } from '@vercel/build-utils';
import type { PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  repoRootPath,
  workPath,
}) => {
  const rootDirectory = relative(repoRootPath, workPath);
  const [gatsbyCache, nodeModulesCache] = await Promise.all([
    glob(join(rootDirectory, '{.cache,public}/**'), repoRootPath),
    glob('**/node_modules/**', repoRootPath || workPath),
  ]);
  return {
    ...gatsbyCache,
    ...nodeModulesCache,
  };
};
