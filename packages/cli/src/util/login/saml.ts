import { URL } from 'url';
import type Client from '../client';
import { inspectTokenRequest, processInspectTokenResponse } from '../oauth';
import http from 'http';
import open from 'open';
import { listen } from 'async-listen';
import prompt from './prompt';
import verify from './verify';
import highlight from '../output/highlight';
import link from '../output/link';
import eraseLines from '../output/erase-lines';
import type { LoginResult } from './types';
import output from '../../output-manager';

export default async function doSamlLogin(
  client: Client,
  teamIdOrSlug: string,
  ssoUserId?: string
) {
  const { session_id, client_id } = await decodeToken(client);
  const params = { session_id, client_id };
  const url = new URL(
    `https://vercel.com/sso/${teamIdOrSlug}?${new URLSearchParams(params).toString()}`
  );
  return doOauthLogin(client, url, 'SAML Single Sign-On', ssoUserId);
}

async function decodeToken(client: Client) {
  const { token } = client.authConfig;

  if (!token) {
    throw new Error(
      `No existing credentials found. Please run \`vercel login\`.`
    );
  }

  const inspectResponse = await inspectTokenRequest(token);

  const [inspectError, inspectResult] =
    await processInspectTokenResponse(inspectResponse);

  if (inspectError) throw inspectError;

  if (
    !inspectResult.active ||
    !inspectResult.session_id ||
    !inspectResult.client_id
  ) {
    throw new Error(
      `Invalid token type. Run \`vercel login\` to log-in and try again.`
    );
  }

  return {
    session_id: inspectResult.session_id,
    client_id: inspectResult.client_id,
  };
}

async function doOauthLogin(
  client: Client,
  url: URL,
  provider: string,
  ssoUserId?: string
): Promise<LoginResult> {
  url.searchParams.set('mode', 'login');

  let result = await getVerificationToken(client, url, provider);

  if (typeof result === 'number') {
    return result;
  }

  if ('verificationToken' in result) {
    output.spinner('Verifying authentication token');
    result = await verify(
      client,
      result.verificationToken,
      undefined,
      provider,
      ssoUserId
    );
    output.success(
      `${provider} authentication complete for ${highlight(result.email)}`
    );
  }

  return result;
}

/**
 * Get the verification token "in-band" by spawning a localhost
 * HTTP server that gets redirected to as the OAuth callback URL.
 *
 * This method is preferred since it doesn't require additional
 * user interaction, however it only works when the web browser
 * is on the same machine as the localhost HTTP server (so doesn't
 * work over SSH, for example).
 */
async function getVerificationToken(
  client: Client,
  url: URL,
  provider: string
) {
  const server = http.createServer();
  const { port } = await listen(server, 0, '127.0.0.1');
  url.searchParams.set('next', `http://localhost:${port}`);

  output.log(`Please visit the following URL in your web browser:`);
  output.log(link(url.href));
  output.spinner(`Waiting for ${provider} authentication to be completed`);

  try {
    const [query] = await Promise.all([
      new Promise<URL['searchParams']>((resolve, reject) => {
        server.once('request', (req, res) => {
          // Close the HTTP connection to prevent
          // `server.close()` from hanging
          res.setHeader('connection', 'close');

          const query = new URL(req.url || '/', 'http://localhost')
            .searchParams;
          resolve(query);

          // Redirect the user's web browser back to
          // the Vercel CLI login notification page
          const location = new URL(
            'https://vercel.com/notifications/cli-login-'
          );
          const loginError = query.get('loginError');
          const ssoEmail = query.get('ssoEmail');
          if (loginError) {
            location.pathname += 'failed';
            location.searchParams.set('loginError', loginError);
          } else if (ssoEmail) {
            location.pathname += 'incomplete';
            location.searchParams.set('ssoEmail', ssoEmail);
            const teamName = query.get('teamName');
            const ssoType = query.get('ssoType');
            if (teamName) {
              location.searchParams.set('teamName', teamName);
            }
            if (ssoType) {
              location.searchParams.set('ssoType', ssoType);
            }
          } else {
            location.pathname += 'success';
            const email = query.get('email');
            if (email) {
              location.searchParams.set('email', email);
            }
          }

          res.statusCode = 302;
          res.setHeader('location', location.href);
          res.end();
        });
        server.once('error', reject);
      }),
      open(url.href),
    ]);

    output.stopSpinner();
    output.print(eraseLines(3));

    const loginError = query.get('loginError');
    if (loginError) {
      const err = JSON.parse(loginError);
      output.prettyError(err);
      return 1;
    }

    // If an `ssoUserId` was returned, then the SAML Profile is not yet connected
    // to a Team member. Prompt the user to log in to a Vercel account now, which
    // will complete the connection to the SAML Profile.
    const ssoUserIdParam = query.get('ssoUserId');
    if (ssoUserIdParam) {
      output.log(
        'Please log in to your Vercel account to complete SAML connection.'
      );
      return prompt(client, undefined, ssoUserIdParam);
    }

    const verificationToken = query.get('token');
    if (!verificationToken) {
      output.error(
        'Verification token was not provided. Please contact support.'
      );
      return 1;
    }

    return { verificationToken };
  } finally {
    server.close();
  }
}
