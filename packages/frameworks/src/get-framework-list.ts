import type { Framework } from './types';
import { interpretManifest, type FrameworkManifest } from './interpret';

/**
 * Default URL for the full frameworks manifest (all fields, including
 * declarative `outputDirName` / `defaultRoutes` strategies).
 *
 * Overridable via {@link GetFrameworkListOptions.manifestUrl} or the
 * `VERCEL_FRAMEWORKS_MANIFEST_URL` env var (same as `build.mjs`).
 */
export const FRAMEWORKS_MANIFEST_URL =
  'https://api-frameworks-two.vercel.sh/v1/frameworks.json';

const DEFAULT_FETCH_TIMEOUT = 3000;

export interface GetFrameworkListOptions {
  /**
   * Manifest URL. Defaults to {@link FRAMEWORKS_MANIFEST_URL}, or
   * `process.env.VERCEL_FRAMEWORKS_MANIFEST_URL` when set.
   */
  manifestUrl?: string;
  /**
   * Fetch timeout in milliseconds. Defaults to 3000.
   * Ignored when `signal` is provided.
   */
  fetchTimeout?: number;
  /** Optional abort signal for the fetch. */
  signal?: AbortSignal;
}

/**
 * Fetches the frameworks manifest from the API and interprets it into the
 * same runtime {@link Framework}[] shape as the sync {@link frameworkList}
 * export.
 *
 * This is an opt-in async twin of the build-time-baked list: callers that need
 * a fresher list (e.g. future CLI detection) can await this without changing
 * the sync default export. On fetch/parse/interpret failure the promise
 * rejects — callers that need a fallback should catch and use
 * `frameworkList`.
 */
export async function getFrameworkList(
  options: GetFrameworkListOptions = {}
): Promise<Framework[]> {
  const {
    manifestUrl = process.env.VERCEL_FRAMEWORKS_MANIFEST_URL ||
      FRAMEWORKS_MANIFEST_URL,
    fetchTimeout = DEFAULT_FETCH_TIMEOUT,
    signal,
  } = options;

  const res = await fetch(manifestUrl, {
    signal: signal ?? AbortSignal.timeout(fetchTimeout),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch frameworks manifest from ${manifestUrl}: ${res.status} ${res.statusText}`
    );
  }

  const manifest = (await res.json()) as FrameworkManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(
      `Frameworks manifest from ${manifestUrl} is empty or not an array`
    );
  }

  return interpretManifest(manifest);
}
