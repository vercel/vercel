import Client from './client';
import getTeams from './get-teams';

export default async function getTeamById(client: Client, teamId: string) {
  const teams = await getTeams(client);
  return teams.find(team => team.id === teamId) || null;
}
