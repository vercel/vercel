import { glob, type PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob('**/{node_modules,.yarn/cache}/**', repoRootPath || workPath);
};
