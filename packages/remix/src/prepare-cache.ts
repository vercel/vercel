import {
  getNodeVersion,
  getSpawnOptions,
  glob,
  runNpmInstall,
} from '@vercel/build-utils';
import { dirname, join, relative } from 'path';
import { require_, chdirAndReadConfig } from './utils';
import type { PrepareCache } from '@vercel/build-utils';

export const prepareCache: PrepareCache = async ({
  entrypoint,
  repoRootPath,
  workPath,
  config,
}) => {
  const root = repoRootPath || workPath;
  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);

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
  const [nodeModulesFiles, cacheDirFiles] = await Promise.all([
    // Cache `node_modules`
    glob('**/node_modules/**', root),

    // Cache the Remix "cacheDirectory" (typically `.cache`)
    glob(relative(root, join(remixConfig.cacheDirectory, '**')), root),
  ]);

  return { ...nodeModulesFiles, ...cacheDirFiles };
};
