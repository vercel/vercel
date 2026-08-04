import type Client from '../client';
import type { Team } from '@vercel-internals/types';
import { teamCache } from './get-team-by-id';

/**
 * Fetches a single team by ID or slug.
 *
 * The `/teams` list endpoint only returns teams where the user is a direct
 * member. A user can also hold a "virtual membership" to a team. In that
 * case the list does not contain the team, but `GET /teams/:id` still
 * returns it, so this lookup resolves it.
 */
export default async function getTeamByIdOrSlug(
  client: Client,
  teamIdOrSlug: string
): Promise<Team> {
  const team = await client.fetch<Team>(
    `/teams/${encodeURIComponent(teamIdOrSlug)}`,
    { useCurrentTeam: false }
  );
  teamCache.set(team.id, team);
  return team;
}
