import readline from 'node:readline';
import pc from 'picocolors';
import * as open from 'open';
import { eraseLines } from 'ansi-escapes';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { updateCurrentTeamAfterLogin } from '../../util/login/update-current-team-after-login';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../util/config/files';
import getGlobalPathConfig from '../../util/config/global-path';
import { getCommandName } from '../../util/pkg-name';
import { emoji } from '../../util/emoji';
import hp from '../../util/humanize-path';
import {
  deviceAuthorizationRequest,
  processDeviceAuthorizationResponse,
  deviceAccessTokenRequest,
  processDeviceAccessTokenResponse,
  isOAuthError,
  verifyJWT,
} from '../../util/oauth';
import o from '../../output-manager';

export async function login(client: Client): Promise<number> {
  const deviceAuthorizationResponse = await deviceAuthorizationRequest();

  o.debug(
    `'Device Authorization response:', ${await deviceAuthorizationResponse.clone().text()}`
  );

  const [deviceAuthorizationError, deviceAuthorization] =
    await processDeviceAuthorizationResponse(deviceAuthorizationResponse);

  if (deviceAuthorizationError) {
    printError(deviceAuthorizationError);
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

  const rl = readline
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // HACK: https://github.com/SBoudrias/Inquirer.js/issues/293#issuecomment-172282009, https://github.com/SBoudrias/Inquirer.js/pull/569
    .on('SIGINT', () => process.exit(0));

  rl.question(
    `
  Visit ${pc.bold(
    o.link(
      verification_uri.replace('https://', ''),
      verification_uri_complete,
      { color: false, fallback: () => verification_uri_complete }
    )
  )}${o.supportsHyperlink ? ` and enter ${pc.bold(user_code)}` : ''}
  ${pc.grey('Press [ENTER] to open the browser')}
`,
    () => {
      open.default(verification_uri_complete);
      o.print(eraseLines(2)); // "Waiting for authentication..." gets printed twice, this removes one when Enter is pressed
      o.spinner('Waiting for authentication...');
      rl.close();
    }
  );

  o.spinner('Waiting for authentication...');

  let intervalMs = interval * 1000;
  let error: Error | undefined = new Error(
    'Timed out waiting for authentication. Please try again.'
  );

  async function pollForToken(): Promise<Error | undefined> {
    while (Date.now() < expiresAt) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      // TODO: Handle connection timeouts and add interval backoff
      const [tokenResponseError, tokenResponse] =
        await deviceAccessTokenRequest({ device_code });

      if (tokenResponseError) {
        // 2x backoff on connection timeouts per spec https://datatracker.ietf.org/doc/html/rfc8628#section-3.5
        if (tokenResponseError.message.includes('timeout')) {
          intervalMs *= 2;
          o.debug(
            `Connection timeout. Slowing down, polling every ${intervalMs / 1000}s...`
          );
          continue;
        }
        return tokenResponseError;
      }

      o.debug(
        `'Device Access Token response:', ${await tokenResponse.clone().text()}`
      );

      const [tokenError, token] =
        await processDeviceAccessTokenResponse(tokenResponse);

      if (isOAuthError(tokenError)) {
        const { code } = tokenError;
        switch (code) {
          case 'authorization_pending':
            continue;
          case 'slow_down':
            intervalMs += 5 * 1000;
            o.debug(
              `Authorization server requests to slow down. Polling every ${intervalMs / 1000}s...`
            );
            continue;
          default:
            return tokenError.cause;
        }
      }

      if (tokenError) return tokenError;

      o.print(eraseLines(2));

      // user is not currently authenticated on this machine
      const isInitialLogin = !client.authConfig.token;

      // Save the user's authentication token to the configuration file.
      client.authConfig.token = token.access_token;
      error = undefined;

      const [accessTokenError, accessToken] = await verifyJWT(
        token.access_token
      );

      if (accessTokenError) {
        return accessTokenError;
      }

      o.debug('access_token verified');

      if (accessToken.team_id) {
        o.debug('Current team updated');
        client.config.currentTeam = accessToken.team_id;
      } else {
        o.debug('Current team deleted');
        delete client.config.currentTeam;
      }

      // If we have a brand new login, update `currentTeam`
      if (isInitialLogin) {
        await updateCurrentTeamAfterLogin(client, client.config.currentTeam);
      }

      writeToAuthConfigFile(client.authConfig);
      writeToConfigFile(client.config);

      o.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

      o.print(`
  ${pc.cyan('Congratulations!')} You are now signed in.

  To deploy something, run ${getCommandName()}.

  ${emoji('tip')} To deploy every commit automatically,
  connect a Git Repository (${pc.bold(o.link('vercel.link/git', 'https://vercel.link/git', { color: false }))}).\n`);

      return;
    }
  }

  error = await pollForToken();

  o.stopSpinner();
  rl.close();

  if (!error) return 0;

  printError(error);
  return 1;
}
