import type Client from '../client';
import output from '../../output-manager';
import { isAPIError } from '../errors-ts';
import { performDeviceCodeFlow } from '../../commands/login/future';

const RECOVERABLE_CHALLENGE_CODES = new Set([
  'challenge_required',
  'challenge_required_email_otp',
  'user_auth_required',
]);

/**
 * Runs a request for Environment Variable records, recovering from
 * authentication challenges by performing a step-up device-code flow when
 * possible, or a full device login for legacy or invalid sessions, and then
 * retrying once. The fresh token pair is persisted so subsequent commands
 * reuse the elevated session until it expires. Recovery does not run for
 * explicit tokens or in non-interactive terminals.
 */
export async function withEnvChallengeRecovery<T>(
  client: Client,
  fn: () => Promise<T>
): Promise<T> {
  const hadStoredSession = Boolean(
    client.authConfig.token || client.authConfig.refreshToken
  );

  try {
    return await fn();
  } catch (error) {
    if (!isAPIError(error)) {
      throw error;
    }

    const isRecoverableChallenge = RECOVERABLE_CHALLENGE_CODES.has(error.code);
    const isRejectedStoredSession =
      hadStoredSession && error.invalidToken === true;

    if (!isRecoverableChallenge && !isRejectedStoredSession) {
      throw error;
    }

    if (
      client.authConfig.tokenSource ||
      !client.stdin.isTTY ||
      client.nonInteractive
    ) {
      throw error;
    }

    output.stopSpinner();
    output.log('Sensitive Environment Variables require fresh authentication.');

    const refreshToken = client.authConfig.refreshToken;
    const acrValues = getAcrValuesFromWWWAuthenticate(error.wwwAuthenticate);
    const tokens =
      isRecoverableChallenge && refreshToken && acrValues
        ? await performDeviceCodeFlow(client, {
            refreshToken,
            acrValues,
            fallbackToLoginOnStepUpFailure: true,
          })
        : await performDeviceCodeFlow(client);
    if (!tokens) {
      throw error;
    }

    client.updateAuthConfig({
      token: tokens.access_token,
      userId: undefined,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token,
    });
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
