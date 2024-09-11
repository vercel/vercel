import readline from 'node:readline';
import fetch, { Response } from 'node-fetch';
import chalk from 'chalk';
import * as open from 'open';
import type Client from '../../../util/client';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { parseArguments } from '../../../util/get-args';
import handleError from '../../../util/handle-error';
import { help } from '../../help';
import { loginCommand } from './command';
// import { updateCurrentTeamAfterLogin } from '../../../util/login/update-current-team-after-login';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../../util/config/files';
import getGlobalPathConfig from '../../../util/config/global-path';
import { getCommandName } from '../../../util/pkg-name';
import { emoji, prependEmoji } from '../../../util/emoji';
import hp from '../../../util/humanize-path';

const as: AuthorizationServerMetadata = {
  client_id: '', // TODO: Embed client_id
  device_authorization_endpoint: new URL(
    'https://vercel.com/api/login/oauth/device-authorization'
  ),
  token_endpoint: new URL('https://vercel.com/api/login/oauth/token'),
};

export async function oauth(client: Client): Promise<number> {
  const { output: o } = client;

  const flagsSpecification = getFlagsSpecification(loginCommand.options);

  let parsedArgs = null;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    o.print(help(loginCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const deviceAuthorizationResponse = await deviceAuthorizationRequest({
    url: as.device_authorization_endpoint,
    client_id: as.client_id,
  });

  const [deviceAuthorizationError, deviceAuthorization] =
    await processDeviceAuthorizationResponse(deviceAuthorizationResponse);

  if (deviceAuthorizationError) {
    handleError(deviceAuthorizationError);
    return 1;
  }

  const { device_code, user_code, verificationURL, expiresAt, interval } =
    deviceAuthorization;

  const rl = readline
    .createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    // HACK: https://github.com/SBoudrias/Inquirer.js/issues/293#issuecomment-172282009, https://github.com/SBoudrias/Inquirer.js/pull/569
    .on('SIGINT', () => process.exit(0));

  rl.question(
    `
  ▲ Sign in to the Vercel CLI

  Visit ${chalk.bold(o.link(verificationURL.host + verificationURL.pathname, verificationURL.href, { color: false }))} to enter ${chalk.bold(user_code)}
  ${chalk.grey('Press [ENTER] to open the browser')}
`,
    () => {
      open.default(verificationURL.href);
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
        await deviceAccessTokenRequest({
          url: as.token_endpoint,
          client_id: as.client_id,
          device_code,
        });

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

      const [tokenError, token] =
        await processDeviceAccessTokenResponse(tokenResponse);

      if (tokenError instanceof OAuthError) {
        const { code } = tokenError;
        switch (code) {
          case 'authorization_pending':
            break;
          case 'slow_down':
            intervalMs += 5 * 1000;
            o.debug(
              `Authorization server requests to slow down. Polling every ${intervalMs / 1000}s...`
            );
            break;
          default:
            return tokenError.cause;
        }
      } else if (tokenError) {
        return tokenError;
      } else if (token) {
        // Save the user's authentication token to the configuration file.
        client.authConfig.token = token.access_token;
        error = undefined;
        // TODO: Decide on what to do with the refresh_token

        // TODO: What to do here? The response has no `teamId`
        // if (token.teamId) {
        //   client.config.currentTeam = token.teamId;
        // } else {
        //   delete client.config.currentTeam;
        // }

        // // If we have a brand new login, update `currentTeam`
        // user is not currently authenticated on this machine
        // const isInitialLogin = !client.authConfig.token;
        // if (isInitialLogin) {
        //   await updateCurrentTeamAfterLogin(
        //     client,
        //     o,
        //     client.config.currentTeam
        //   );
        // }

        writeToAuthConfigFile(client.authConfig);
        writeToConfigFile(client.config);

        o.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

        o.print(`
  ${chalk.cyan('Congratulations!')} You are now signed in. In order to deploy something, run ${getCommandName()}.

  ${prependEmoji(
    `Connect your Git Repositories to deploy every branch push automatically (${chalk.bold(o.link('vercel.link/git', 'https://vercel.link/git', { color: false }))}).`,
    emoji('tip')
  )}\n`);

        return;
      }
    }
  }

  error = await pollForToken();

  o.stopSpinner();
  rl.close();

  if (!error) return 0;

  handleError(error);
  return 1;
}

interface DeviceAuthorizationRequestOptions {
  url: URL;
  client_id: string;
}

/**
 * Perform the Device Authorization Request
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.1
 */
async function deviceAuthorizationRequest(
  options: DeviceAuthorizationRequestOptions
): Promise<Response> {
  return await fetch(options.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: options.client_id }),
  });
}

interface DeviceAuthorizationResponseProcessed {
  /** The device verification code. */
  device_code: string;
  /** The end-user verification code. */
  user_code: string;
  /**
   * The minimum amount of time in seconds that the client
   * SHOULD wait between polling requests to the token endpoint.
   * @default 5
   */
  interval: number;
  /**
   * The end-user verification URI on the authorization server.
   * Calculated from `verification_uri_complete`.
   */
  verificationURL: URL;
  /**
   * The absolute lifetime of the `device_code` and `user_code`.
   * Calculated from `expires_in`.
   */
  expiresAt: number;
}

/**
 * Process the Device Authorization request Response
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.2
 */
async function processDeviceAuthorizationResponse(
  response: Response
): Promise<[Error] | [null, DeviceAuthorizationResponseProcessed]> {
  const json = await response.json();

  if (!response.ok) {
    return [new OAuthError('Device authorization request failed', json)];
  }

  if (typeof json !== 'object' || json === null)
    return [new TypeError('Expected response to be an object')];
  else if (!('device_code' in json) || typeof json.device_code !== 'string')
    return [new TypeError('Expected `device_code` to be a string')];
  else if (!('user_code' in json) || typeof json.user_code !== 'string')
    return [new TypeError('Expected `user_code` to be a string')];
  else if (
    !('verification_uri_complete' in json) ||
    typeof json.verification_uri_complete !== 'string' ||
    !canParseURL(json.verification_uri_complete)
  )
    return [
      new TypeError('Expected `verification_uri_complete` to be a string'),
    ];
  else if (!('expires_in' in json) || typeof json.expires_in !== 'number')
    return [new TypeError('Expected `expires_in` to be a number')];
  else if (!('interval' in json) || typeof json.interval !== 'number')
    return [new TypeError('Expected `interval` to be a number')];

  return [
    null,
    {
      device_code: json.device_code,
      user_code: json.user_code,
      verificationURL: new URL(json.verification_uri_complete),
      expiresAt: Date.now() + json.expires_in * 1000,
      interval: json.interval,
    },
  ];
}

interface DeviceAccessTokenRequestOptions {
  url: URL;
  client_id: string;
  device_code: string;
}

/**
 * Perform the Device Access Token Request
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.4
 */
async function deviceAccessTokenRequest(
  options: DeviceAccessTokenRequestOptions
): Promise<[Error] | [null, Response]> {
  try {
    return [
      null,
      await fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: options.client_id,
          device_code: options.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        // TODO: Drop `node-fetch` and just use `signal`
        timeout: 10 * 1000,
        // @ts-expect-error: Signal is part of `fetch` spec, should drop `node-fetch`
        signal: AbortSignal.timeout(10 * 1000),
      }),
    ];
  } catch (error) {
    if (error instanceof Error) return [error];
    return [
      new Error('An unknown error occurred. See the logs for details.', {
        cause: error,
      }),
    ];
  }
}

/**
 * Process the Device Access Token request Response
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.5
 */
async function processDeviceAccessTokenResponse(response: Response): Promise<
  | [OAuthError | TypeError]
  | [
      null,
      {
        /** The access token issued by the authorization server. */
        access_token: string;

        /** The type of the token issued */
        token_type: 'Bearer';
        /** The lifetime in seconds of the access token.The lifetime in seconds of the access token. */
        expires_in: number;
        /** The refresh token, which can be used to obtain new access tokens. */
        refresh_token?: string;
        /** The scope of the access token. */
        scope?: string;
      },
    ]
> {
  const json = await response.json();

  if (!response.ok) {
    return [new OAuthError('Device access token request failed', json)];
  }

  if (typeof json !== 'object' || json === null)
    return [new TypeError('Expected response to be an object')];
  else if (!('access_token' in json) || typeof json.access_token !== 'string')
    return [new TypeError('Expected `access_token` to be a string')];
  else if (!('token_type' in json) || json.token_type !== 'Bearer')
    return [new TypeError('Expected `token_type` to be "Bearer"')];
  else if (!('expires_in' in json) || typeof json.expires_in !== 'number')
    return [new TypeError('Expected `expires_in` to be a number')];
  else if (
    'refresh_token' in json &&
    (typeof json.refresh_token !== 'string' || !json.refresh_token)
  )
    return [new TypeError('Expected `refresh_token` to be a string')];
  else if ('scope' in json && typeof json.scope !== 'string')
    return [new TypeError('Expected `scope` to be a string')];

  return [null, json];
}

function canParseURL(url: string) {
  try {
    return !!new URL(url);
  } catch {
    return false;
  }
}

interface AuthorizationServerMetadata {
  device_authorization_endpoint: URL;
  token_endpoint: URL;
  client_id: string;
}

type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  // Device Athorization Response Errors
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token';

interface OAuthErrorResponse {
  error: OAuthErrorCode;
  error_description?: string;
  error_uri?: string;
}

function processOAuthErrorResponse(json: unknown): OAuthErrorResponse {
  if (typeof json !== 'object' || json === null)
    throw new TypeError('Expected response to be an object');
  else if (!('error' in json) || typeof json.error !== 'string')
    throw new TypeError('Expected `error` to be a string');
  else if (
    'error_description' in json &&
    typeof json.error_description !== 'string'
  )
    throw new TypeError('Expected `error_description` to be a string');
  else if ('error_uri' in json && typeof json.error_uri !== 'string')
    throw new TypeError('Expected `error_uri` to be a string');

  return json as OAuthErrorResponse;
}

class OAuthError extends Error {
  code: OAuthErrorCode;
  cause: Error;
  constructor(message: string, response: unknown) {
    const error = processOAuthErrorResponse(response);
    let cause = error.error;
    if (error.error_description) cause += `: ${error.error_description}`;
    if (error.error_uri) cause += ` (${error.error_uri})`;

    super(message, { cause });
    this.cause = new Error(cause);
    this.code = error.error;
  }
}
