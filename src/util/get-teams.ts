import Client from './client';
import { APIError, InvalidToken } from './errors-ts';
import { Team } from '../types';

type Response = {
  teams: Team[];
};

export default async function getTeams(client: Client) {
  try {
    const { teams } = await client.fetch<Response>(`/teams`);
    return teams;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }
}
