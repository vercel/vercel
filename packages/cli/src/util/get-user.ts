import { APIError, InvalidToken, MissingUser } from './errors-ts';
import type { User } from '../types';
import type Client from './client';

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
