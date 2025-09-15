import readline from 'node:readline';
import chalk from 'chalk';
import * as open from 'open';
import { eraseLines } from 'ansi-escapes';
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

export async function login(
  client: Client,
  telemetry: LoginTelemetryClient
): Promise<number> {
  const deviceAuthorizationResponse = await deviceAuthorizationRequest();

  o.debug(
    `'Device Authorization response:', ${await deviceAuthorizationResponse.clone().text()}`
  );

  const [deviceAuthorizationError, deviceAuthorization] =
    await processDeviceAuthorizationResponse(deviceAuthorizationResponse);

  if (deviceAuthorizationError) {
    printError(deviceAuthorizationError);
    telemetry.trackState('error');
    return 1;
  }

  const {
    device_code,
    user_code,
    verification_uri,
    verification_uri_complete,
    expiresAt,
    interval,
  } = deviceAuthorization;

  let rlClosed = false;
  const rl = readline
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // HACK: https://github.com/SBoudrias/Inquirer.js/issues/293#issuecomment-172282009, https://github.com/SBoudrias/Inquirer.js/pull/569
    .on('SIGINT', () => {
      telemetry.trackState('canceled');
      process.exit(0);
    });

  rl.question(
    `
  Visit ${chalk.bold(
    o.link(
      verification_uri.replace('https://', ''),
      verification_uri_complete,
      { color: false, fallback: () => verification_uri_complete }
    )
  )}${o.supportsHyperlink ? ` and enter ${chalk.bold(user_code)}` : ''}
  ${chalk.grey('Press [ENTER] to open the browser')}
`,
    () => {
      open.default(verification_uri_complete);
      o.print(eraseLines(2)); // "Waiting for authentication..." gets printed twice, this removes one when Enter is pressed
      o.spinner('Waiting for authentication...');
      rl.close();
      rlClosed = true;
    }
  );

  o.spinner('Waiting for authentication...');

  let intervalMs = interval * 1000;
  let error: Error | undefined = new Error(
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

      // If we get here, we throw away any possible token errors like polling, or timeouts
      error = undefined;

      o.print(eraseLines(2));

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

      return;
    }
  }

  error = await pollForToken();

  o.stopSpinner();
  if (!rlClosed) {
    rl.close();
  }

  if (!error) {
    telemetry.trackState('success');
    return 0;
  }

  printError(error);
  telemetry.trackState('error');
  return 1;
}

async function wait(intervalMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, intervalMs));
}
