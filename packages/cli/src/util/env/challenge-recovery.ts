import type Client from '../client';
import output from '../../output-manager';
import { isAPIError } from '../errors-ts';
import { performDeviceCodeFlow } from '../../commands/login/future';

/**
 * Runs a request for Environment Variable records, recovering from
 * `challenge_required` API errors by performing a step-up device-code
 * authentication flow and retrying once. The fresh token pair is
 * persisted so subsequent commands reuse the elevated session until it
 * expires. Recovery requires a stored refresh token, a token that did
 * not come from `--token`/`VERCEL_TOKEN`, and an interactive terminal;
 * otherwise the original error is rethrown.
 */
export async function withEnvChallengeRecovery<T>(
  client: Client,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isAPIError(error) || error.code !== 'challenge_required') {
      throw error;
    }

    const refreshToken = client.authConfig.refreshToken;
    if (!refreshToken || client.authConfig.tokenSource || !client.stdin.isTTY) {
      throw error;
    }

    output.stopSpinner();
    output.log('Sensitive Environment Variables require fresh authentication.');

    const acrValues = getAcrValuesFromWWWAuthenticate(error.wwwAuthenticate);
    if (!acrValues) {
      throw error;
    }

    const tokens = await performDeviceCodeFlow(client, {
      refreshToken,
      acrValues,
    });
    if (!tokens) {
      throw error;
    }

    client.updateAuthConfig({
      token: tokens.access_token,
      userId: undefined,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });
    if (tokens.refresh_token) {
      client.updateAuthConfig({ refreshToken: tokens.refresh_token });
    }
    client.persistAuthConfig();

    return await fn();
  }
}

export function getAcrValuesFromWWWAuthenticate(header: string | undefined) {
  if (!header) {
    return;
  }

  const bearerIndex = header.toLowerCase().indexOf('bearer');
  if (bearerIndex === -1) {
    return;
  }

  const bearerChallenge = header.slice(bearerIndex + 'bearer'.length);
  const match = bearerChallenge.match(
    /(?:^|[,\s])acr_values=(?:"((?:\\.|[^"\\])*)"|([^,\s]+))/i
  );

  return match?.[1]?.replace(/\\(.)/g, '$1') ?? match?.[2];
}
