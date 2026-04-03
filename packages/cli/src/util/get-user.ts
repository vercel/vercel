import type Client from './client';
import type { User } from '@vercel-internals/types';
import { APIError, InvalidToken, MissingUser } from './errors-ts';
import { isError } from '@vercel/error-utils';
import writeJSON from 'write-json-file';
import { getAuthConfigFilePath } from './config/files';
import output from '../output-manager';

function tryPersistCachedUserId(client: Client) {
  if (client.authConfig.skipWrite) {
    return;
  }

  try {
    writeJSON.sync(getAuthConfigFilePath(), client.authConfig, {
      indent: 2,
      mode: 0o600,
    });
  } catch (err: unknown) {
    output.debug(
      `Failed to update cached userId in auth config: ${
        isError(err) ? err.message : String(err)
      }`
    );
  }
}

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
      tryPersistCachedUserId(client);
    }

    client.telemetryEventStore.updateUserId(res.user.id);

    return res.user;
  } catch (error) {
    if (error instanceof APIError && error.status === 403) {
      if (client.authConfig.userId) {
        client.updateAuthConfig({ userId: undefined });
        tryPersistCachedUserId(client);
      }

      throw new InvalidToken(client.authConfig.tokenSource);
    }

    throw error;
  }
}
