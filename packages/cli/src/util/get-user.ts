import type Client from './client';
import type { User } from '@vercel-internals/types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';

export default async function getUser(client: Client) {
  try {
    const res = await client.fetch<{ user: User }>('/v2/user', {
      useCurrentTeam: false,
    });

    if (!res.user) {
      throw new MissingUser();
    }

    if (client.authConfig.userId !== res.user.id) {
      client.updateAuthConfig({ userId: res.user.id });
      client.writeToAuthConfigFile();
    }

    client.telemetryEventStore.updateUserId(res.user.id);

    return res.user;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      if (client.authConfig.userId) {
        client.updateAuthConfig({ userId: undefined });
        client.writeToAuthConfigFile();
      }

      throw new InvalidToken(client.authConfig.tokenSource);
    }

    throw error;
  }
}
