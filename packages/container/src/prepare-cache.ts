import type { Files, PrepareCacheOptions } from '@vercel/build-utils';
import { glob } from '@vercel/build-utils';
import { resolve } from 'node:path';
import { BuildahStoreCache } from './buildah-store-cache/cache';
import { sharedBuildahStoreLock } from './buildah-store-cache/lock';
import { BUILDPACK_CACHE_DIR } from './buildpacks/cache';
import { BuildahClient } from './clients/buildah';
import { debug, info } from './util';

/**
 * Collect the saved buildpack caches and Buildah store snapshot. Every path
 * must be inside the repository root; otherwise the platform drops the whole
 * build cache.
 */
export async function prepareCache(
  options: PrepareCacheOptions
): Promise<Files> {
  const root = resolve(options.repoRootPath || options.workPath);
  const buildpackFiles = await collectBuildpackCache(root);
  const buildahStoreFiles = await BuildahStoreCache.forProject(
    options,
    new BuildahClient(sharedBuildahStoreLock)
  ).afterBuilds();
  return { ...buildpackFiles, ...buildahStoreFiles };
}

async function collectBuildpackCache(root: string): Promise<Files> {
  const start = Date.now();
  const files = await glob(`${BUILDPACK_CACHE_DIR}/**`, root);
  const count = Object.keys(files).length;
  if (count > 0) {
    info(
      `cached ${count} file${count === 1 ? '' : 's'} under ${BUILDPACK_CACHE_DIR} in ${Date.now() - start}ms`
    );
  } else {
    debug(`no cache to persist under ${BUILDPACK_CACHE_DIR}`);
  }
  return files;
}
