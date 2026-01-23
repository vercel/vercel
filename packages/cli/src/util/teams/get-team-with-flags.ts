import type Client from '../client';
import type { Team } from '@vercel-internals/types';

/**
 * Team object extended with feature flags.
 * Returned when fetching a team with `?flags=true`.
 */
export interface TeamWithFlags extends Team {
  flags?: Record<string, boolean | number | string | null>;
}

/**
 * Fetches a team by ID with feature flags included.
 * This is used to check feature flags for gating CLI behavior.
 *
 * @param client - The CLI client instance
 * @param teamId - The team ID to fetch
 * @returns Team object with flags property
 */
export async function getTeamWithFlags(
  client: Client,
  teamId: string
): Promise<TeamWithFlags> {
  return client.fetch<TeamWithFlags>(`/v2/teams/${teamId}?flags=true`);
}
