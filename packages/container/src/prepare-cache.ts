import type { Files, PrepareCacheOptions } from '@vercel/build-utils';
import { glob } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import { GRAPH_ROOT_CACHE_REL, setBuildahGraphRoot } from './storage-driver';
import { debug, info, isBuildContainer } from './util';

/**
 * Cache buildah's image layer store between builds.
 *
 * The store lives at `<workPath>/.vercel/cache/...` (see `setBuildahGraphRoot`)
 * so that globbing it relative to `workPath` yields project-relative keys that
 * the platform restores back to the same path on the next build. (Anchoring the
 * store outside `workPath` would produce keys the restore step can't place,
 * which is why the cache previously never warmed.)
 *
 * Only meaningful in the build container, where buildah runs. Locally there is
 * no such store, so this is a no-op. Disable with
 * `VERCEL_VCR_DISABLE_LAYER_CACHE=1`.
 */
export async function prepareCache(
  options: PrepareCacheOptions
): Promise<Files> {
  if (process.env.VERCEL_VCR_DISABLE_LAYER_CACHE) {
    debug('layer cache disabled (VERCEL_VCR_DISABLE_LAYER_CACHE)');
    return {};
  }

  // The buildah store only exists in the build container.
  if (!isBuildContainer()) {
    debug('skipping container layer cache (not in build container)');
    return {};
  }

  const { workPath } = options;
  // Keep this in agreement with the build path: resolve the same work-dir store
  // location that the build used as buildah's graphroot.
  const graphRoot = setBuildahGraphRoot(workPath);

  if (!existsSync(graphRoot)) {
    debug(`no buildah store to cache at ${graphRoot}`);
    return {};
  }

  const start = Date.now();
  // Glob relative to `workPath` so the returned keys are project-relative
  // (`.vercel/cache/...`) and the platform restores them to the same place.
  const files = await glob(`${GRAPH_ROOT_CACHE_REL}/**`, workPath);
  const count = Object.keys(files).length;
  info(
    `cached container layer store: ${count} files from ${graphRoot} ` +
      `in ${Date.now() - start}ms`
  );
  return files;
}
