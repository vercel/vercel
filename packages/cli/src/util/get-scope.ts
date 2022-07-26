import Client from './client.js';
import getUser from './get-user.js';
import getTeamById from './teams/get-team-by-id.js';
import { TeamDeleted } from './errors-ts.js';
import type { Team } from '../types.js';

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

  if (client.config.currentTeam && opts.getTeam !== false) {
    team = await getTeamById(client, client.config.currentTeam);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  return { contextName, team, user };
}
