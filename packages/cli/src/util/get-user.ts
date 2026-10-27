import type Client from './client';
import { hasRefreshToken, isValidAccessToken } from './client';
import type { AuthConfig, User } from '@vercel-internals/types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';
import output from '../output-manager';

/**
 * The username saved by the last user lookup, for `whoami --cached`. It is only
 * trusted for the user it was saved for: other CLIs (cli-go, older versions)
 * can save a new userId and leave the name alone. A session whose token has
 * expired with no way to refresh it has no user to report.
 */
export function getCachedUsername(authConfig: AuthConfig): string | undefined {
  const { cachedUser, userId } = authConfig;
  if (!cachedUser || cachedUser.id !== userId) {
    return undefined;
  }
  if (!isValidAccessToken(authConfig) && !hasRefreshToken(authConfig)) {
    return undefined;
  }
  return cachedUser.username;
}

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

    const { userId, cachedUser } = client.authConfig;
    if (
      userId !== res.user.id ||
      cachedUser?.id !== res.user.id ||
      cachedUser.username !== res.user.username
    ) {
      client.updateAuthConfig({
        userId: res.user.id,
        cachedUser: { id: res.user.id, username: res.user.username },
      });
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
      if (client.authConfig.userId || client.authConfig.cachedUser) {
        client.updateAuthConfig({ userId: undefined, cachedUser: undefined });
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
