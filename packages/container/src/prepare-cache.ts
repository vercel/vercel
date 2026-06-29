import type { Files, PrepareCacheOptions } from '@vercel/build-utils';
import { glob } from '@vercel/build-utils';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import {
  BUILDAH_GRAPH_ROOT,
  GRAPH_ROOT_CACHE_REL,
  layerStoreCacheDir,
} from './storage-driver';
import { debug, info, isBuildContainer } from './util';

/**
 * Restore a previously cached buildah image store into the real graphroot.
 *
 * buildah's store must run at `BUILDAH_GRAPH_ROOT` (on the XFS `/vercel`
 * volume) so the native overlay driver initializes \u2014 it can't run under the
 * project work dir, which is on the cell's overlayfs rootfs (overlay can't nest
 * on overlay). But only the work dir's `.vercel/cache` is persisted across
 * builds. So `prepareCache` copies the store *out* to the work-dir cache, and
 * this copies it *back* to the graphroot before the build. Best-effort: a
 * failed restore just means a cold (but correct) build.
 *
 * Call once at the start of `build()`. No-op outside the build container or
 * when the layer cache is disabled.
 */
export function restoreLayerStore(workPath: string): void {
  if (process.env.VERCEL_VCR_DISABLE_LAYER_CACHE) {
    return;
  }
  if (!isBuildContainer()) {
    return;
  }
  const cacheDir = layerStoreCacheDir(workPath);
  if (!existsSync(cacheDir)) {
    debug(`layer store: cold (no cached store at ${cacheDir})`);
    return;
  }
  try {
    const start = Date.now();
    // Copy into the graphroot. The graphroot is created fresh per build, so a
    // plain recursive copy is sufficient (no stale entries to reconcile).
    mkdirSync(BUILDAH_GRAPH_ROOT, { recursive: true });
    cpSync(cacheDir, BUILDAH_GRAPH_ROOT, { recursive: true });
    info(
      `restored container layer store from ${cacheDir} to ` +
        `${BUILDAH_GRAPH_ROOT} in ${Date.now() - start}ms`
    );
  } catch (err) {
    // Don't fail the build over cache restore; just build cold.
    info(
      `could not restore container layer store (continuing cold): ${
        (err as Error).message
      }`
    );
  }
}

/**
 * Cache buildah's image layer store between builds.
 *
 * Mirrors the real store (`BUILDAH_GRAPH_ROOT`, on the XFS volume) into the
 * work dir's `.vercel/cache` and globs it relative to `workPath`, so the
 * returned keys are project-relative and the platform restores them to the same
 * place on the next build (where `restoreLayerStore` copies them back to the
 * graphroot). The store can't live in the work dir directly because overlay
 * can't nest on the cell's overlayfs rootfs.
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

  if (!existsSync(BUILDAH_GRAPH_ROOT)) {
    debug(`no buildah store to cache at ${BUILDAH_GRAPH_ROOT}`);
    return {};
  }

  const { workPath } = options;
  const cacheDir = layerStoreCacheDir(workPath);

  const start = Date.now();
  // Mirror the real store into the work-dir cache so it can be persisted.
  // Replace any prior mirror so removed layers don't linger.
  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  cpSync(BUILDAH_GRAPH_ROOT, cacheDir, { recursive: true });

  // Glob relative to `workPath` so the returned keys are project-relative
  // (`.vercel/cache/...`) and the platform restores them to the same place.
  const files = await glob(`${GRAPH_ROOT_CACHE_REL}/**`, workPath);
  const count = Object.keys(files).length;
  info(
    `cached container layer store: ${count} files from ${BUILDAH_GRAPH_ROOT} ` +
      `(mirrored to ${cacheDir}) in ${Date.now() - start}ms`
  );
  return files;
}
