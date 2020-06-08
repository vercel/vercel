import Client from './client';
import { APIError, InvalidToken } from './errors';
import { Team } from '../types';
import NowTeams from './teams';

let teams: Team[] | undefined;

export default async function getTeams(client: Client): Promise<Team[]> {
  if (teams) return teams;

  try {
    // we're using NowTeams because `client.fetch` hangs on windows
    const teamClient = new NowTeams({
      apiUrl: client._apiUrl,
      token: client._token,
      debug: client._debug,
    });

    teams = (await teamClient.ls()).teams;
    return teams || [];
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }
}
