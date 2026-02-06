import type { Team } from '@vercel-internals/types';
import type Client from './client';
import { TeamDeleted } from './errors-ts';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';

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

  return { contextName, team, user };
}
