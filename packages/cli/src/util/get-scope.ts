import Client from './client';
import getUser from './get-user';
import getTeamById from './get-team-by-id';
import { TeamDeleted } from './errors-ts';
import { Team } from '../types';

export default async function getScope(client: Client) {
  const user = await getUser(client);
  let contextName = user.username || user.email;
  let team: Team | null = null;

  if (client.config.currentTeam) {
    team = await getTeamById(client, client.config.currentTeam);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  return { contextName, team, user };
}
