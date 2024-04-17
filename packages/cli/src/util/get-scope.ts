import Client from './client';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import { TeamDeleted } from './errors-ts';
import type { Team } from '@vercel-internals/types';

interface GetScopeOptions {
  getTeam?: boolean;
}

export default async function getScope(
  client: Client,
  opts: GetScopeOptions = {}
) {
  const user = await getUser(client);
  let contextName = user.username || user.email;
  let team: Team | null = null;
  const defaultTeamId =
    user.version === 'northstar' ? user.defaultTeamId : undefined;
  const currentTeamOrDefaultTeamId = client.config.currentTeam || defaultTeamId;

  if (currentTeamOrDefaultTeamId && opts.getTeam !== false) {
    team = await getTeamById(client, currentTeamOrDefaultTeamId);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  /**
   * isCanonicalHobbyTeam is true, if the Hobby team is the canonical team of the user account.
   * Canonical Hoby team is the team that was created "automatically" upon new signups or by Northstar migration.
   * A user may have multiple Hobby teams (e.g., Pro Trial downgrade), but can have only one canonical Hobby team.
   */
  const isCanonicalHobbyTeam =
    (team?.billing.plan === 'hobby' &&
      team.createdDirectToHobby &&
      team.creatorId === user.id) ??
    false;
  if (isCanonicalHobbyTeam) {
    client.authContext.isCanonicalHobbyTeam = true;
  }

  return { contextName, team, user };
}
