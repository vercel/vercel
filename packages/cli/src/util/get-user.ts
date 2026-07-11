import type Client from './client';
import type { User } from '@vercel-internals/types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';
import output from '../output-manager';

export default async function getUser(client: Client) {
  if (client.user) {
    return client.user;
  }

  if (client.userPromise) {
    return client.userPromise;
  }

  client.userPromise = fetchUser(client).finally(() => {
    client.userPromise = undefined;
  });

  return client.userPromise;
}

async function fetchUser(client: Client) {
  try {
    const res = await client.fetch<{ user: User }>('/v2/user', {
      useCurrentTeam: false,
    });

    if (!res.user) {
      throw new MissingUser();
    }

    if (client.authConfig.userId !== res.user.id) {
      client.updateAuthConfig({ userId: res.user.id });
      try {
        client.persistAuthConfig();
      } catch {
        output.debug('Failed to persist cached userId to auth config.');
      }
    }

    client.telemetryEventStore.updateUserId(res.user.id);
    client.user = res.user;

    return res.user;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      client.user = undefined;
      client.userPromise = undefined;
      if (client.authConfig.userId) {
        client.updateAuthConfig({ userId: undefined });
        try {
          client.persistAuthConfig();
        } catch {
          output.debug('Failed to persist cached userId to auth config.');
        }
      }

      throw new InvalidToken(client.authConfig.tokenSource);
    }

    throw error;
  }
}
