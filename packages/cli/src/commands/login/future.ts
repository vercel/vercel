import readline from 'node:readline';
import chalk from 'chalk';
import * as open from 'open';
import { eraseLines } from 'ansi-escapes';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { updateCurrentTeamAfterLogin } from '../../util/login/update-current-team-after-login';
import getGlobalPathConfig from '../../util/config/global-path';
import { getCommandName } from '../../util/pkg-name';
import { emoji } from '../../util/emoji';
import hp from '../../util/humanize-path';
import {
  deviceAuthorizationRequest,
  processDeviceAuthorizationResponse,
  deviceAccessTokenRequest,
  processTokenResponse,
  isOAuthError,
} from '../../util/oauth';
import o from '../../output-manager';
import type { LoginTelemetryClient } from '../../util/telemetry/commands/login';

export interface DeviceCodeTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Core device code flow: initiates the device authorization request,
 * displays the verification URL, opens the browser, and polls for
 * the token. Returns the token set on success or `null` on failure.
 *
 * @param options.teamId - The ID of the team that the current token
 *   lacks access to. When provided, `&team_id={id}` is appended to the
 *   verification URL so the device flow page enforces authorization
 *   for that team (e.g., SAML) before completing the request.
 */
export async function performDeviceCodeFlow(
  client: Client,
  options?: { teamId?: string }
): Promise<DeviceCodeTokens | null> {
  const deviceAuthorizationResponse = await deviceAuthorizationRequest();

  o.debug(
    `'Device Authorization response:', ${await deviceAuthorizationResponse.clone().text()}`
  );

  const [deviceAuthorizationError, deviceAuthorization] =
    await processDeviceAuthorizationResponse(deviceAuthorizationResponse);

  if (deviceAuthorizationError) {
    printError(deviceAuthorizationError);
    return null;
  }

  const { device_code, user_code, verification_uri, expiresAt, interval } =
    deviceAuthorization;

  let { verification_uri_complete } = deviceAuthorization;

  // When re-authenticating for a missing scope (e.g., a SAML-enforced team),
  // append the team ID as a `team_id` query parameter so the device flow
  // page requires the user to authorize that team before completing.
  if (options?.teamId) {
    const url = new URL(verification_uri_complete);
    url.searchParams.set('team_id', options.teamId);
    verification_uri_complete = url.toString();
  }

  // Determine if we should skip opening the browser (only in CI, but not in Cursor)
  const isCursorAgent =
    client.agentName === KNOWN_AGENTS.CURSOR ||
    client.agentName === KNOWN_AGENTS.CURSOR_CLI;
  const shouldSkipBrowser = process.env.CI && !isCursorAgent;

  o.log(
    `\n  Visit ${chalk.bold(
      o.link(
        verification_uri.replace('https://', ''),
        verification_uri_complete,
        { color: false, fallback: () => verification_uri_complete }
      )
    )}${o.supportsHyperlink ? ` and enter ${chalk.bold(user_code)}` : ''}\n`
  );

  // Open browser automatically unless we're in CI (excluding Cursor)
  if (!shouldSkipBrowser) {
    try {
      await open.default(verification_uri_complete);
    } catch (error) {
      // Fail gracefully if browser can't be opened
      o.debug(`Failed to open browser: ${error}`);

      // If in non-interactive agent mode, provide specific instructions
      if (client.isAgent && client.nonInteractive) {
        o.log(
          `\n${chalk.yellow('⚠')} ${chalk.bold('Browser could not be opened automatically.')}\n`
        );
        o.log(
          `Please ask the user to manually visit the URL above and complete the authentication process.\n`
        );
      }
    }
  }

  const rl = readline
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // HACK: https://github.com/SBoudrias/Inquirer.js/issues/293#issuecomment-172282009, https://github.com/SBoudrias/Inquirer.js/pull/569
    .on('SIGINT', () => {
      process.exit(0);
    });

  o.spinner('Waiting for authentication...');

  let intervalMs = interval * 1000;
  let result: DeviceCodeTokens | null = null;
  let flowError: Error | undefined = new Error(
    'Timed out waiting for authentication. Please try again.'
  );

  async function pollForToken(): Promise<Error | undefined> {
    while (Date.now() < expiresAt) {
      const [tokenResponseError, tokenResponse] =
        await deviceAccessTokenRequest({ device_code });

      if (tokenResponseError) {
        // 2x backoff on connection timeouts per spec https://datatracker.ietf.org/doc/html/rfc8628#section-3.5
        if (tokenResponseError.message.includes('timeout')) {
          intervalMs *= 2;
          o.debug(
            `Connection timeout. Slowing down, polling every ${intervalMs / 1000}s...`
          );
          await wait(intervalMs);
          continue;
        }
        return tokenResponseError;
      }

      o.debug(
        `'Device Access Token response:', ${await tokenResponse.clone().text()}`
      );

      const [tokensError, tokens] = await processTokenResponse(tokenResponse);

      if (isOAuthError(tokensError)) {
        const { code } = tokensError;
        switch (code) {
          case 'authorization_pending':
            await wait(intervalMs);
            continue;
          case 'slow_down':
            intervalMs += 5 * 1000;
            o.debug(
              `Authorization server requests to slow down. Polling every ${intervalMs / 1000}s...`
            );
            await wait(intervalMs);
            continue;
          default:
            return tokensError.cause;
        }
      }

      if (tokensError) return tokensError;

      o.print(eraseLines(2));

      result = {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token,
      };

      return;
    }
  }

  flowError = await pollForToken();

  o.stopSpinner();
  rl.close();

  if (flowError) {
    printError(flowError);
    return null;
  }

  return result;
}

export async function login(
  client: Client,
  telemetry: LoginTelemetryClient
): Promise<number> {
  const tokens = await performDeviceCodeFlow(client);

  if (!tokens) {
    telemetry.trackState('error');
    return 1;
  }

  // user is not currently authenticated on this machine
  const isInitialLogin = !client.authConfig.token;

  client.updateAuthConfig({
    token: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    refreshToken: tokens.refresh_token,
  });

  client.updateConfig({ currentTeam: undefined });

  // If we have a brand new login, update `currentTeam`
  if (isInitialLogin) {
    await updateCurrentTeamAfterLogin(client);
  }

  client.writeToAuthConfigFile();
  client.writeToConfigFile();

  o.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

  o.print(`
  ${chalk.cyan('Congratulations!')} You are now signed in.

  To deploy something, run ${getCommandName()}.

  ${emoji('tip')} To deploy every commit automatically,
  connect a Git Repository (${chalk.bold(o.link('vercel.link/git', 'https://vercel.link/git', { color: false }))}).\n`);

  telemetry.trackState('success');
  return 0;
}

async function wait(intervalMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, intervalMs));
}
