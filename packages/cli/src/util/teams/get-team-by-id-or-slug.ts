import type Client from '../client';
import type { Team } from '@vercel-internals/types';

export const teamCache = new Map<string, Team>();

/**
 * Fetches a single team by ID or slug.
 *
 * The `/teams` list endpoint only returns teams where the user is a direct
 * member. A user can also hold a "virtual membership" to a team. In that
 * case the list does not contain the team, but this lookup still resolves
 * it.
 *
 * `useCurrentTeam` controls the `teamId` query parameter. The API route
 * `/teams/:teamId` binds the path segment to the same name and overwrites
 * the query value, so both settings resolve the same team today. Pass
 * `false` when the lookup must not depend on that overwrite.
 */
export default async function getTeamByIdOrSlug(
  client: Client,
  teamIdOrSlug: string,
  { useCurrentTeam = true }: { useCurrentTeam?: boolean } = {}
): Promise<Team> {
  let team = teamCache.get(teamIdOrSlug);

  if (!team) {
    team = await client.fetch<Team>(
      `/teams/${encodeURIComponent(teamIdOrSlug)}`,
      { useCurrentTeam }
    );
    teamCache.set(team.id, team);
    teamCache.set(team.slug, team);
  }

  return team;
}
