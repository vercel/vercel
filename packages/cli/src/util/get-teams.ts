import Client from './client';
import { APIError, InvalidToken } from './errors-ts';
import { Team } from '../types';
// @ts-ignore
import NowTeams from './teams.js';

let teams: Team[] | undefined;

export default async function getTeams(client: Client): Promise<Team[]> {
  if (teams) return teams;

  try {
    // we're using NowTeams because `client.fetch` hangs on windows
    const teamClient = new NowTeams({
      apiUrl: client.apiUrl,
      token: client.authConfig.token,
      debug: client.output.isDebugEnabled(),
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
