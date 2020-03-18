import Client from './client';
import { User } from '../types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';

let user: User | undefined;

export default async function getUser(client: Client) {
  if (user) return user;

  try {
    const res = await client.fetch<{ user: User }>('/www/user', {
      useCurrentTeam: false,
    });

    if (!res.user) {
      throw new MissingUser();
    }

    user = res.user;
    return user;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }

    throw error;
  }
}
