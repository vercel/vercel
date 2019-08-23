import Client from './client';
import { User } from '../types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';

export default async function getUser(client: Client) {
  let user;

  try {
    ({ user } = await client.fetch<{ user: User }>('/www/user', {
      useCurrentTeam: false
    }));
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      throw new InvalidToken();
    }
    throw error;
  }

  if (!user) {
    throw new MissingUser();
  }

  return user;
}
