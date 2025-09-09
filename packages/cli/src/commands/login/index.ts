import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { loginCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LoginTelemetryClient } from '../../util/telemetry/commands/login';
import chalk from 'chalk';
import readline from 'node:readline';
import * as open from 'open';
import { eraseLines } from 'ansi-escapes';
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

export default async function login(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(loginCommand.options);

  const telemetry = new LoginTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('login');
    output.print(help(loginCommand, { columns: client.stderr.columns }));
    return 0;
  }

  if (parsedArgs.flags['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  const obsoleteFlags = Object.keys(parsedArgs.flags).filter(flag => {
    const flagKey = flag.replace('--', '');
    const option = loginCommand.options.find(o => o.name === flagKey);
    if (!option || typeof option === 'number') return;
    return 'deprecated' in option && option.deprecated;
  });

  if (obsoleteFlags.length) {
    const flags = obsoleteFlags.map(f => chalk.bold(f)).join(', ');
    output.warn(`The following flags are deprecated: ${flags}`);
  }

  const obsoleteArguments = parsedArgs.args.slice(1);
  if (obsoleteArguments.length) {
    const args = obsoleteArguments.map(a => chalk.bold(a)).join(', ');
    output.warn(`The following arguments are deprecated: ${args}`);
  }

  if (obsoleteArguments.length || obsoleteFlags.length) {
    output.print(
      `Read more in our ${output.link('changelog', 'https://vercel.com/changelog/new-vercel-cli-login-flow-6W6aBtFyBazKdOEC0V4DAl')}.\n`
    );
  }

  telemetry.trackState('started');
  const deviceAuthorizationResponse = await deviceAuthorizationRequest();

  output.debug(
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
    .on('SIGINT', () => process.exit(0));

  rl.question(
    `
  Visit ${chalk.bold(
    output.link(
      verification_uri.replace('https://', ''),
      verification_uri_complete,
      { color: false, fallback: () => verification_uri_complete }
    )
  )}${output.supportsHyperlink ? ` and enter ${chalk.bold(user_code)}` : ''}
  ${chalk.grey('Press [ENTER] to open the browser')}
`,
    () => {
      open.default(verification_uri_complete);
      output.print(eraseLines(2)); // "Waiting for authentication..." gets printed twice, this removes one when Enter is pressed
      output.spinner('Waiting for authentication...');
      rl.close();
      rlClosed = true;
    }
  );

  output.spinner('Waiting for authentication...');

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
          output.debug(
            `Connection timeout. Slowing down, polling every ${intervalMs / 1000}s...`
          );
          continue;
        }
        return tokenResponseError;
      }

      output.debug(
        `'Device Access Token response:', ${await tokenResponse.clone().text()}`
      );

      const [tokensError, tokens] = await processTokenResponse(tokenResponse);

      if (isOAuthError(tokensError)) {
        const { code } = tokensError;
        switch (code) {
          case 'authorization_pending':
            continue;
          case 'slow_down':
            intervalMs += 5 * 1000;
            output.debug(
              `Authorization server requests to slow down. Polling every ${intervalMs / 1000}s...`
            );
            continue;
          default:
            return tokensError.cause;
        }
      }

      if (tokensError) return tokensError;

      // If we get here, we throw away any possible token errors like polling, or timeouts
      error = undefined;

      output.print(eraseLines(2));

      // user is not currently authenticated on this machine
      const isInitialLogin = !client.authConfig.token;

      client.updateAuthConfig({
        token: tokens.access_token,
        type: 'oauth',
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

      output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

      output.print(`
  ${chalk.cyan('Congratulations!')} You are now signed in.

  To deploy something, run ${getCommandName()}.

  ${emoji('tip')} To deploy every commit automatically,
  connect a Git Repository (${chalk.bold(output.link('vercel.link/git', 'https://vercel.link/git', { color: false }))}).\n`);

      return;
    }
  }

  error = await pollForToken();

  output.stopSpinner();
  if (!rlClosed) {
    rl.close();
  }

  if (!error) {
    telemetry.trackState('success');
    return 0;
  }

  telemetry.trackState('error');
  printError(error);
  return 1;
}
