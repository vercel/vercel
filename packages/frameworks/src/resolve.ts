import { join } from 'path';
import { promises } from 'fs';
import { lt as semverLt, valid as semverValid } from 'semver';
import type { Framework } from './types';
import {
  interpretFramework,
  UnsupportedFrameworkEntryError,
  type FrameworkManifestEntry,
  type FrameworkRuntimeOverrides,
} from './manifest';

const { mkdir, readFile, writeFile } = promises;

export const FRAMEWORKS_MANIFEST_URL =
  'https://api-frameworks-two.vercel.sh/v1/frameworks.json';

const CACHE_FILE_NAME = 'frameworks-manifest.json';
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_FETCH_TIMEOUT = 3000;

/**
 * A manifest entry that this CLI cannot build. These entries are still
 * usable for framework *detection* (they carry `detectors`), so callers can
 * recognize the project and tell the user to upgrade. Entries with
 * `failOnStale: true` must abort the build instead of falling back.
 */
export interface StaleFrameworkEntry {
  entry: FrameworkManifestEntry;
  reason: 'min-cli-version' | 'unsupported-entry';
}

export interface PartitionedFrameworkList {
  frameworks: Framework[];
  requiresUpdate: StaleFrameworkEntry[];
}

export interface ResolvedFrameworkList extends PartitionedFrameworkList {
  source: 'remote' | 'cache' | 'pinned';
}

export interface PartitionManifestOptions {
  /**
   * Used to enforce each entry's `minCliVersion`. When omitted,
   * `minCliVersion` is not enforced. When not valid semver (e.g. snapshot
   * builds), every version-gated entry is treated as requiring an update.
   */
  cliVersion?: string;
  overrides?: Record<string, FrameworkRuntimeOverrides>;
}

export interface ResolveFrameworkListOptions extends PartitionManifestOptions {
  /** Skip the network and cache entirely and use the pinned manifest. */
  skipRemote?: boolean;
  /** When omitted, no cache is read or written. */
  cacheDir?: string;
  /** Defaults to 24 hours. */
  cacheTtl?: number;
  /** Milliseconds. Defaults to 3000. */
  fetchTimeout?: number;
  manifestUrl?: string;
  /** Fallback when the remote and cache are unavailable. */
  pinnedManifest: readonly FrameworkManifestEntry[];
}

interface ManifestCache {
  fetchedAt: number;
  manifest: FrameworkManifestEntry[];
}

function isRemoteFrameworksDisabled(): boolean {
  const val = process.env.VERCEL_SKIP_REMOTE_FRAMEWORKS;
  return (
    val === '1' || (typeof val === 'string' && val.toLowerCase() === 'true')
  );
}

/**
 * Splits a manifest into presets this CLI can build and presets that
 * require an update. Unlike `createFrameworks`, this never throws on
 * entries it cannot interpret — they are reported in `requiresUpdate`.
 */
export function partitionManifest(
  manifest: readonly FrameworkManifestEntry[],
  options: PartitionManifestOptions = {}
): PartitionedFrameworkList {
  const { cliVersion, overrides } = options;
  const frameworks: Framework[] = [];
  const requiresUpdate: StaleFrameworkEntry[] = [];

  for (const entry of manifest) {
    if (typeof cliVersion === 'string' && entry.minCliVersion) {
      // Uncomparable versions (snapshot CLI builds, malformed manifest
      // entries) are conservatively treated as stale.
      const version = semverValid(cliVersion);
      const minVersion = semverValid(entry.minCliVersion);
      if (!version || !minVersion || semverLt(version, minVersion)) {
        requiresUpdate.push({ entry, reason: 'min-cli-version' });
        continue;
      }
    }

    try {
      frameworks.push(
        interpretFramework(
          entry,
          entry.slug === null ? undefined : overrides?.[entry.slug]
        )
      );
    } catch (error) {
      if (error instanceof UnsupportedFrameworkEntryError) {
        requiresUpdate.push({ entry, reason: 'unsupported-entry' });
        continue;
      }
      throw error;
    }
  }

  return { frameworks, requiresUpdate };
}

async function readManifestCache(
  cacheFile: string
): Promise<ManifestCache | undefined> {
  try {
    const raw = await readFile(cacheFile, 'utf8');
    const cache = JSON.parse(raw) as ManifestCache;
    if (
      typeof cache?.fetchedAt === 'number' &&
      Array.isArray(cache?.manifest)
    ) {
      return cache;
    }
  } catch (_err) {
    // treated as absent
  }
  return undefined;
}

async function writeManifestCache(
  cacheFile: string,
  manifest: FrameworkManifestEntry[]
): Promise<void> {
  try {
    await mkdir(join(cacheFile, '..'), { recursive: true });
    const cache: ManifestCache = { fetchedAt: Date.now(), manifest };
    await writeFile(cacheFile, JSON.stringify(cache));
  } catch (_err) {
    // must never fail the caller
  }
}

async function fetchManifest(
  url: string,
  timeout: number
): Promise<FrameworkManifestEntry[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} fetching "${url}"`);
  }
  const manifest = (await res.json()) as FrameworkManifestEntry[];
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(`Malformed frameworks manifest from "${url}"`);
  }
  return manifest;
}

/**
 * Resolves the framework presets to use for detection and builds, loading
 * the manifest with the following priority:
 *
 * 1. A cached copy of the remote manifest, when younger than `cacheTtl`
 * 2. The remote manifest (fetched with a short timeout, then cached)
 * 3. A stale cached copy, when the fetch fails
 * 4. The pinned manifest bundled with this package
 *
 * `VERCEL_SKIP_REMOTE_FRAMEWORKS=1` always uses the pinned manifest.
 * The result is partitioned via {@link partitionManifest}.
 */
export async function resolveFrameworkList(
  options: ResolveFrameworkListOptions
): Promise<ResolvedFrameworkList> {
  const {
    skipRemote = false,
    cacheDir,
    cacheTtl = DEFAULT_CACHE_TTL,
    fetchTimeout = DEFAULT_FETCH_TIMEOUT,
    manifestUrl = FRAMEWORKS_MANIFEST_URL,
    pinnedManifest,
    ...partitionOptions
  } = options;

  if (skipRemote || isRemoteFrameworksDisabled()) {
    return {
      ...partitionManifest(pinnedManifest, partitionOptions),
      source: 'pinned',
    };
  }

  const cacheFile = cacheDir ? join(cacheDir, CACHE_FILE_NAME) : undefined;
  const cached = cacheFile ? await readManifestCache(cacheFile) : undefined;

  if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
    return {
      ...partitionManifest(cached.manifest, partitionOptions),
      source: 'cache',
    };
  }

  try {
    const manifest = await fetchManifest(manifestUrl, fetchTimeout);
    if (cacheFile) {
      await writeManifestCache(cacheFile, manifest);
    }
    return {
      ...partitionManifest(manifest, partitionOptions),
      source: 'remote',
    };
  } catch (_err) {
    // A stale cache is still newer than the pinned manifest.
    if (cached) {
      return {
        ...partitionManifest(cached.manifest, partitionOptions),
        source: 'cache',
      };
    }
    return {
      ...partitionManifest(pinnedManifest, partitionOptions),
      source: 'pinned',
    };
  }
}
