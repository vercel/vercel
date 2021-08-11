import Client from './client';
import { Team } from '../types';
import { APIError, InvalidToken } from './errors-ts';

let teams: Team[] | undefined;

export default async function getTeams(client: Client): Promise<Team[]> {
  if (teams) return teams;

  try {
    const body = await client.fetch<{ teams: Team[] }>('/v1/teams', {
      useCurrentTeam: false,
    });
    teams = body.teams || [];
    return teams;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }
}
