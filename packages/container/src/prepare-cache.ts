import type { Files, PrepareCacheOptions } from '@vercel/build-utils';
import { glob } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import { posix as posixPath } from 'node:path';
import { BUILDAH_GRAPH_ROOT } from './storage-driver';
import { debug, info, isBuildContainer } from './util';

/**
 * The graphroot (`/vercel/.containers/storage`) lives under `/vercel`, the
 * always-mounted XFS cell volume. We anchor the cache glob at `/vercel` so the
 * returned `Files` keys are `\.containers/storage/...`, and on the next build
 * the build cache restores them back to exactly that path — where buildah's
 * `storage.conf` expects its store. A warm store lets buildah reuse unchanged
 * layers (with `buildah build --layers`) instead of rebuilding them.
 */
const CACHE_ROOT = '/vercel';
const GRAPH_ROOT_REL = posixPath.relative(CACHE_ROOT, BUILDAH_GRAPH_ROOT);

/**
 * Cache buildah's image layer store between builds.
 *
 * Only meaningful in the build container (the store is at a fixed absolute
 * path there). Locally there is no such store, so this is a no-op. Disable with
 * `VERCEL_VCR_DISABLE_LAYER_CACHE=1`.
 */
export async function prepareCache(
  _options: PrepareCacheOptions
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

  if (!existsSync(BUILDAH_GRAPH_ROOT)) {
    debug(`no buildah store to cache at ${BUILDAH_GRAPH_ROOT}`);
    return {};
  }

  const start = Date.now();
  const files = await glob(`${GRAPH_ROOT_REL}/**`, CACHE_ROOT);
  const count = Object.keys(files).length;
  info(
    `cached container layer store: ${count} files from ${BUILDAH_GRAPH_ROOT} ` +
      `in ${Date.now() - start}ms`
  );
  return files;
}
