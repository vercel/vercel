import Client from './client';

export default async function getTeamById(client: Client, teamId: string) {
  const team = await client.fetch(`/teams/${teamId}`);
  return team;
}
