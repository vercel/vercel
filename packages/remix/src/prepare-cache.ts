import { existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import { glob } from '@vercel/build-utils';
import type { PrepareCache } from '@vercel/build-utils';
import type { AppConfig } from './types';

export const prepareCache: PrepareCache = async ({
  entrypoint,
  repoRootPath,
  workPath,
}) => {
  let cacheDirectory = '.cache';
  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);
  try {
    const remixConfigFile = findConfig(entrypointFsDirname, 'remix.config');
    if (remixConfigFile) {
      const remixConfigModule = await import(
        pathToFileURL(remixConfigFile).href
      );
      const remixConfig: AppConfig = remixConfigModule?.default || {};
      if (remixConfig.cacheDirectory) {
        cacheDirectory = remixConfig.cacheDirectory;
      }
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

const configExts = ['.js', '.cjs', '.mjs'];

function findConfig(dir: string, basename: string): string | undefined {
  for (const ext of configExts) {
    const file = resolve(dir, basename + ext);
    if (existsSync(file)) return relative(dir, file);
  }

  return undefined;
}
