import Client from './client';
import { Token } from '../types';
import { APIError, InvalidToken } from './errors-ts';

export default async function getToken(client: Client, id = 'current') {
  try {
    const res = await client.fetch<{ token: Token }>(`/v5/user/tokens/${id}`, {
      useCurrentTeam: false,
    });
    return res.token;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }
}
