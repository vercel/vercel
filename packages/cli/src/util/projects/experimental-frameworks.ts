import type { ExperimentalOverrides } from '@vercel/fs-detectors';
import type Client from '../client';
import output from '../../output-manager';

/**
 * API endpoint that returns which experimental framework presets have been
 * remotely graduated (opted in) without requiring a CLI upgrade.
 *
 * NOTE: not configured/deployed yet. Until it exists, the fetch is expected to
 * fail; we fail open (treat as "no overrides") so detection is unaffected.
 */
const ENDPOINT = '/v1/frameworks/experimental-overrides';

interface ExperimentalOverridesResponse {
  // Mirrors the agreed API shape: `{ overrideExperimental: { container: true } }`.
  overrideExperimental?: ExperimentalOverrides;
}

// Per-process cache. Detection can run several times in one command (e.g. once
// per workspace package), so resolve the remote value at most once. We cache
// the in-flight promise so concurrent callers share a single request.
let cached: Promise<ExperimentalOverrides> | undefined;

/**
 * Resolve the set of experimental framework presets that should be treated as
 * enabled, keyed by slug (e.g. `{ container: true }`).
 *
 * Fails open: any error (endpoint missing, network failure, unexpected shape)
 * resolves to `{}`, so the only effect is that experimental presets stay gated
 * behind `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS` exactly as they are today.
 */
export function resolveExperimentalOverrides(
  client: Client
): Promise<ExperimentalOverrides> {
  if (!cached) {
    cached = fetchExperimentalOverrides(client);
  }
  return cached;
}

async function fetchExperimentalOverrides(
  client: Client
): Promise<ExperimentalOverrides> {
  try {
    const res = await client.fetch<ExperimentalOverridesResponse>(ENDPOINT, {
      // Detection blocks the interactive deploy/link flow, so keep this snappy;
      // a missing/slow endpoint must not stall project setup.
      retry: { retries: 0 },
    });
    const overrides = res?.overrideExperimental;
    if (overrides && typeof overrides === 'object') {
      return overrides;
    }
    return {};
  } catch (err) {
    output.debug(
      `Failed to resolve experimental framework overrides: ${
        (err as Error).message
      }`
    );
    return {};
  }
}

/** Test-only: reset the per-process cache. */
export function resetExperimentalOverridesCache(): void {
  cached = undefined;
}
