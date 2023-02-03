import { dirname, join, relative } from 'path';
import { glob } from '@vercel/build-utils';
import { readConfig } from '@remix-run/dev/dist/config';
import type { PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  entrypoint,
  repoRootPath,
  workPath,
}) => {
  let cacheDirectory = '.cache';
  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);
  try {
    const remixConfig = await readConfig(entrypointFsDirname);
    if (remixConfig.cacheDirectory) {
      cacheDirectory = remixConfig.cacheDirectory;
    }
  } catch (err: any) {
    // Ignore error if `remix.config.js` does not exist
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }

  const root = repoRootPath || workPath;

  const [nodeModulesFiles, cacheDirFiles] = await Promise.all([
    // Cache `node_modules`
    glob('**/node_modules/**', root),

    // Cache the Remix "cacheDirectory" (typically `.cache`)
    glob(relative(root, join(entrypointFsDirname, cacheDirectory, '**')), root),
  ]);

  return { ...nodeModulesFiles, ...cacheDirFiles };
};
