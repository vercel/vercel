import {
  getNodeVersion,
  getSpawnOptions,
  glob,
  runNpmInstall,
} from '@vercel/build-utils';
import { dirname, join, relative } from 'path';
import { require_, chdirAndReadConfig, isVite } from './utils';
import type { Files, PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  entrypoint,
  repoRootPath,
  workPath,
  config,
}) => {
  const root = repoRootPath || workPath;
  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);
  let cacheDirFiles: Files | undefined;

  if (!isVite(workPath)) {
    // Because the `node_modules` directory was modified to install
    // the forked Remix compiler, re-install to the "fresh" dependencies
    // state before the cache gets created.
    const nodeVersion = await getNodeVersion(
      entrypointFsDirname,
      undefined,
      config
    );
    const spawnOpts = getSpawnOptions({}, nodeVersion);
    await runNpmInstall(
      entrypointFsDirname,
      [],
      {
        ...spawnOpts,
        stdio: 'ignore',
      },
      undefined,
      nodeVersion
    );

    const packageJsonPath = join(entrypointFsDirname, 'package.json');
    const remixRunDevPath = dirname(
      require_.resolve('@remix-run/dev/package.json', {
        paths: [entrypointFsDirname],
      })
    );
    const remixConfig = await chdirAndReadConfig(
      remixRunDevPath,
      entrypointFsDirname,
      packageJsonPath
    );
    // Cache the Remix "cacheDirectory" (typically `.cache`)
    cacheDirFiles = await glob(
      relative(root, join(remixConfig.cacheDirectory, '**')),
      root
    );
  }

  // Cache `node_modules`
  const nodeModulesFiles = await glob('**/node_modules/**', root);

  return { ...nodeModulesFiles, ...cacheDirFiles };
};
