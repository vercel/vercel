/**
 * Version 1 build cache summary returned by `GET /v13/deployments/:idOrUrl`
 * for callers with private deployment access. Typed loosely because the CLI
 * must render older, partial, or newer responses without inventing values.
 *
 * Source of truth: `packages/deployments-types/build-cache-summary.ts` in
 * vercel/api.
 */
export type BuildCacheSummary = {
  version?: number;
  restore?: {
    status?: string;
    source?: string;
    reason?: string;
  };
  save?: {
    saved?: boolean;
    reason?: string;
    compressedSizeBytes?: number;
    cacheLimitBytes?: number;
    /** Number of paths selected for packing, not files in the archive. */
    fileCount?: number;
  };
};

type KnownSave =
  | {
      saved: true;
      compressedSizeBytes: number;
      cacheLimitBytes: number;
      fileCount?: number;
    }
  | { saved: false; reason: 'size_exceeded'; cacheLimitBytes: number }
  | { saved: false; reason: string };

/** Reasons a build skipped saving on purpose, worded like the dashboard. */
const NOT_SAVED_LABELS: Record<string, string> = {
  disabled: 'not saved (caching disabled)',
  prebuilt: 'not saved (prebuilt deployment)',
  no_cache_branch: 'not saved (no branch to cache)',
  forced_skip: 'not saved (skipped)',
  missing_metadata: 'not saved (missing metadata)',
  no_files: 'not saved (nothing to cache)',
};

/**
 * Describes the cache this deployment's build saved for the human `Build Cache`
 * section of `vercel inspect`. It never describes the cache the build
 * restored. A saved cache returns label/value rows. Anything else returns one
 * line: why the cache was not saved, or `unavailable` when the summary is
 * missing or malformed, never a zero or "not saved".
 */
export function describeBuildCache(
  summary: unknown
): string | [label: string, value: string][] {
  const save = getKnownSave(summary);
  if (!save) {
    return 'unavailable';
  }

  if (save.saved) {
    const rows: [string, string][] = [
      [
        'size',
        `${formatCacheBytes(save.compressedSizeBytes)} / ${formatCacheBytes(save.cacheLimitBytes)} limit`,
      ],
    ];
    if (save.fileCount !== undefined) {
      rows.push([
        'file count',
        `~${save.fileCount.toLocaleString('en-US')} (approx., paths selected for packing)`,
      ]);
    }
    return rows;
  }

  if ('cacheLimitBytes' in save) {
    return `not saved (exceeded ${formatCacheBytes(save.cacheLimitBytes)} limit)`;
  }
  if (save.reason === 'failed') {
    return 'upload failed';
  }
  return NOT_SAVED_LABELS[save.reason] ?? 'not saved';
}

/**
 * `vercel inspect --json` output: only the save outcome, as the API returned
 * it. Restore and the schema version are left out, like the human output.
 */
export function getBuildCacheJson(
  summary: unknown
): { save: unknown } | undefined {
  if (!summary || typeof summary !== 'object') return undefined;
  const { save } = summary as { save?: unknown };
  return save === undefined ? undefined : { save };
}

/**
 * The API value is untrusted, so check every field the section renders.
 * Anything unexpected renders as unavailable.
 */
function getKnownSave(summary: unknown): KnownSave | undefined {
  if (!summary || typeof summary !== 'object') return undefined;
  const { version, save } = summary as {
    version?: unknown;
    save?: Record<string, unknown>;
  };
  if (version !== 1 || !save || typeof save !== 'object') return undefined;

  if (save.saved === true) {
    if (
      isCount(save.compressedSizeBytes) &&
      isCount(save.cacheLimitBytes) &&
      (save.fileCount === undefined || isCount(save.fileCount))
    ) {
      return save as KnownSave;
    }
    return undefined;
  }
  if (save.saved !== false || typeof save.reason !== 'string') {
    return undefined;
  }
  if (save.reason === 'size_exceeded') {
    return isCount(save.cacheLimitBytes) ? (save as KnownSave) : undefined;
  }
  return { saved: false, reason: save.reason };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

const BINARY_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/**
 * The build container sets cache limits in binary units (for example 4.75 GiB
 * for turbo machines), so format sizes in KiB/MiB/GiB to match them.
 */
function formatCacheBytes(value: number): string {
  let unit = 0;
  let scaled = value;
  while (scaled >= 1024 && unit < BINARY_UNITS.length - 1) {
    scaled /= 1024;
    unit++;
  }
  const rounded = Number(scaled.toFixed(2));
  return `${rounded} ${BINARY_UNITS[unit]}`;
}
