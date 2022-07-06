import { glob } from '@vercel/build-utils';
import type { PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob('**/node_modules/**', repoRootPath || workPath);
};
