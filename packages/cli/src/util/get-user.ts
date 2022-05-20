import Client from './client';
import { User } from '../types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';

export default async function getUser(client: Client) {
  try {
    const res = await client.fetch<{ user: User }>('/v2/user', {
      useCurrentTeam: false,
    });

    if (!res.user) {
      throw new MissingUser();
    }

    return res.user;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }

    throw error;
  }
}
