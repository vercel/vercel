import fs from 'fs';
import { join, relative, sep } from 'path';
import debug from '../debug';
import type {
  StaticDiscovery,
  StaticMount,
  StaticPromotionOptions,
  StaticPromotionResult,
} from './types';
import {
  byCopyPriority,
  logLabel,
  mountCovers,
  trimSlashes,
  trimTrailingSlashes,
} from './utils';

/** The CDN URL path a copied file lands at, e.g. "/static/logo.png". */
function cdnUrlPath(outputStaticDir: string, destPath: string): string {
  const rel = relative(outputStaticDir, destPath);
  return rel === '' ? '/' : '/' + rel.split(sep).join('/');
}

/**
 * Copy each mount's directory into the CDN tree at its URL prefix.
 *
 * A path is filled only by the highest-priority source whose prefix covers it,
 * so a lower-priority source never leaks a file that would 404 at runtime.
 * Priority follows {@link byCopyPriority}; the per-file filter enforces it.
 * Files listed in `excludedFiles` are skipped so the Lambda serves them.
 *
 * A failed mount is skipped (the Lambda still serves it), but it keeps its
 * namespace so lower-priority sources cannot fill it. Returns the mounts that
 * were copied, so a failed mount gets no fallback route (empty when all fail).
 */
export async function copyStaticMounts(
  discovery: Pick<StaticDiscovery, 'mounts' | 'excludedFiles'>,
  outputStaticDir: string,
  opts?: StaticPromotionOptions
): Promise<StaticMount[]> {
  const excluded = new Set(discovery.excludedFiles);

  // Normalized upfront: the filter runs per copied file (and prunes whole
  // covered directories), so it should not re-normalize per prefix.
  const higherPriority: string[] = [];
  const copied: StaticMount[] = [];
  for (const mount of byCopyPriority(discovery.mounts)) {
    const dest = join(outputStaticDir, trimSlashes(mount.urlPath));
    try {
      await fs.promises.mkdir(dest, { recursive: true });
      await fs.promises.cp(mount.directory, dest, {
        recursive: true,
        force: false,
        filter: (_src, destPath) => {
          const urlPath = cdnUrlPath(outputStaticDir, destPath);
          return (
            !higherPriority.some(base => mountCovers(base, urlPath)) &&
            !excluded.has(urlPath)
          );
        },
      });
      copied.push(mount);
      debug(`copied ${mount.directory} -> ${dest}`);
    } catch (err) {
      debug(
        `${logLabel(opts)}: skipping ${mount.urlPath}: copy failed (${err})`
      );
    }
    higherPriority.push(trimTrailingSlashes(mount.urlPath));
  }
  return copied;
}

/**
 * Copy a discovery's mounts into `outputStaticDir`. Returns null when there
 * is nothing to promote: no mounts discovered, or none could be copied.
 */
export async function promoteStaticFiles(
  discovery: StaticDiscovery,
  outputStaticDir: string,
  opts?: StaticPromotionOptions
): Promise<StaticPromotionResult | null> {
  const label = logLabel(opts);
  const { mounts } = discovery;
  if (mounts.length === 0) {
    debug(`${label}: no static mounts found, skipping`);
    return null;
  }
  debug(
    `${label}: found ${mounts.length} static mount(s): ${mounts.map(m => m.urlPath).join(', ')}`
  );

  const copiedMounts = await copyStaticMounts(discovery, outputStaticDir, opts);
  if (copiedMounts.length === 0) {
    return null;
  }
  return { discovery, copiedMounts, outputStaticDir };
}
