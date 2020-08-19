import Client from './client';
import getUser from './get-user';
import getTeamById from './get-team-by-id';
import { TeamDeleted } from './errors-ts';

export default async function getScope(client: Client) {
  const user = await getUser(client);

  if (client.currentTeam) {
    const team = await getTeamById(client, client.currentTeam);

    if (!team) {
      throw new TeamDeleted();
    }

    return {
      contextName: team.slug,
      team,
      user,
    };
  }

  return {
    contextName: user.username || user.email,
    team: null,
    user,
  };
}
