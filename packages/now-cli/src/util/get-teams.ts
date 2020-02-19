import Client from './client';
import { APIError, InvalidToken } from './errors-ts';
import { Team } from '../types';
// @ts-ignore
import NowTeams from './teams.js';

let teams: Team[] | undefined;

export default async function getTeams(client: Client) {
  if (teams) return teams;

  try {
    // we're using NowTeams because `client.fetch` hangs on windows
    const teamClient = new NowTeams({
      apiUrl: client._apiUrl,
      token: client._token,
      debug: client._debug,
    });

    const teams = (await teamClient.ls()).teams;
    return teams as Team[];
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }
}
