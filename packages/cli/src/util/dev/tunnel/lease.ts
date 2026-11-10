import type { Org } from '@vercel-internals/types';
import type Client from '../../client';
import { isAPIError } from '../../errors-ts';
import output from '../../../output-manager';

/** How long a release on shutdown may hold up Ctrl-C. */
const RELEASE_TIMEOUT_MS = 2_000;

/**
 * Reserve a chosen alias for the developer's tunnel in api-dev-tunnel, which
 * holds it while the tunnel is connected or serving, and 24 hours past that.
 * Another developer's tunnel can take a name only once it's released or has
 * lapsed:
 *
 * - `reserved`: the lease is this tunnel's.
 * - `held`: another tunnel's lease is live.
 * - `unsupported`: the service takes no reservations, so the caller keeps its
 *   own check of who holds the alias.
 */
export async function reserveAlias(
  client: Client,
  org: Org,
  projectId: string,
  alias: string
): Promise<'reserved' | 'held' | 'unsupported'> {
  try {
    await client.fetch('/v1/dev-tunnel/aliases', {
      method: 'POST',
      accountId: org.id,
      body: { projectId, alias },
    });
    return 'reserved';
  } catch (err) {
    if (isAPIError(err) && err.status === 409) return 'held';
    if (isAPIError(err) && err.status === 404) return 'unsupported';
    throw err;
  }
}

/**
 * Give up the tunnel's lease on an alias, so another developer can take the
 * name without waiting for it to lapse. Best effort and bounded: the lease
 * lapses on its own.
 */
export async function releaseAlias(
  client: Client,
  org: Org,
  projectId: string,
  alias: string
): Promise<void> {
  try {
    await client.fetch(
      `/v1/dev-tunnel/aliases/${encodeURIComponent(alias)}?projectId=${encodeURIComponent(projectId)}`,
      {
        method: 'DELETE',
        accountId: org.id,
        signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
      }
    );
  } catch (err) {
    output.debug(`Could not release the tunnel's lease on ${alias}: ${err}`);
  }
}
