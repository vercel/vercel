import Client from './client';
import { Team } from '../types';

const teamCache = new Map<string, Team>();

export default async function getTeamById(
  client: Client,
  teamId: string
): Promise<Team> {
  let team = teamCache.get(teamId);

  if (!team) {
    team = await client.fetch<Team>(`/teams/${teamId}`);
    teamCache.set(teamId, team);
  }

  return team;
}
