import type Client from './client';
import getTeams from './teams/get-teams';

/** Team slug whose members make up the internal cohort. */
export const VERCEL_TEAM_SLUG = 'vercel';

/**
 * Check memberships already loaded on the client, without fetching.
 *
 * Opportunistic by design: a Vercelian reads as ineligible when the membership
 * list has not been loaded yet. Correct for enrollment, which simply defers to
 * a later invocation — use {@link isVercelian} for anything that refuses.
 */
export function isVercelianFromLoadedTeams(client: Client): boolean {
  return client.teams?.some(team => team.slug === VERCEL_TEAM_SLUG) === true;
}

/**
 * Whether the authenticated user belongs to the Vercel team, loading
 * memberships if they are not cached yet.
 *
 * For gates, where treating unloaded memberships as "not a member" would refuse
 * a real Vercelian. `getTeams` caches on the client and dedupes concurrent
 * calls, so this costs at most one request per process.
 */
export async function isVercelian(client: Client): Promise<boolean> {
  if (isVercelianFromLoadedTeams(client)) {
    return true;
  }

  try {
    const teams = await getTeams(client);
    return teams.some(team => team.slug === VERCEL_TEAM_SLUG);
  } catch {
    // An unauthenticated or failing request is not a membership signal.
    return false;
  }
}
