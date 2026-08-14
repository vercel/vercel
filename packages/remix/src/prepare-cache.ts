import {
  defaultCachePathGlob,
  getEnvForPackageManager,
  getNodeVersion,
  glob,
  runNpmInstall,
  scanParentDirs,
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
    const nodeVersion = await getNodeVersion(
      entrypointFsDirname,
      undefined,
      config
    );
    const {
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      turboSupportsCorepackHome,
    } = await scanParentDirs(entrypointFsDirname, true);
    const spawnEnv = getEnvForPackageManager({
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      nodeVersion,
      env: process.env,
      turboSupportsCorepackHome,
      projectCreatedAt: config.projectSettings?.createdAt,
    });

    // Because the `node_modules` directory was modified to install
    // the forked Remix compiler, re-install to the "fresh" dependencies
    // state before the cache gets created.
    await runNpmInstall(
      entrypointFsDirname,
      [],
      {
        env: spawnEnv,
        stdio: 'ignore',
      },
      undefined,
      config.projectSettings?.createdAt
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

  const defaultCacheFiles = await glob(defaultCachePathGlob, root);

  return { ...defaultCacheFiles, ...cacheDirFiles };
};
