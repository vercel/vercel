import http from 'http';
import open from 'open';
import { URL } from 'url';
import listen from 'async-listen';
import isDocker from 'is-docker';
import Client from '../client';
import prompt, { readInput } from './prompt';
import verify from './verify';
import highlight from '../output/highlight';
import link from '../output/link';
import eraseLines from '../output/erase-lines';
import { LoginResult } from './types';

export default async function doOauthLogin(
  client: Client,
  url: URL,
  provider: string,
  outOfBand = isHeadless(),
  ssoUserId?: string
): Promise<LoginResult> {
  url.searchParams.set('mode', 'login');

  const getVerificationToken = outOfBand
    ? getVerificationTokenOutOfBand
    : getVerificationTokenInBand;

  let result = await getVerificationToken(client, url, provider);

  if (typeof result === 'number') {
    return result;
  }

  if ('verificationToken' in result) {
    const { output } = client;
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
async function getVerificationTokenInBand(
  client: Client,
  url: URL,
  provider: string
) {
  const { output } = client;
  const server = http.createServer();
  const address = await listen(server, 0, '127.0.0.1');
  const { port } = new URL(address);
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
      return prompt(client, undefined, false, ssoUserIdParam);
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

/**
 * Get the verification token "out-of-band" by presenting the login URL
 * to the user and directing them to visit the URL in their web browser.
 *
 * A prompt is rendered asking for the verification token that is
 * provided to them in the callback URL after the login is successful.
 */
async function getVerificationTokenOutOfBand(client: Client, url: URL) {
  const { output } = client;
  url.searchParams.set(
    'next',
    `https://vercel.com/notifications/cli-login-oob`
  );
  output.log(`Please visit the following URL in your web browser:`);
  output.log(link(url.href));
  output.print('\n');
  output.log(
    `After login is complete, enter the verification code printed in your browser.`
  );
  const verificationToken = await readInput(client, 'Verification code:');
  output.print(eraseLines(6));

  // If the pasted token begins with "saml_", then the `ssoUserId` was returned.
  // Prompt the user to log in to a Vercel account now, which will complete the
  // connection to the SAML Profile.
  if (verificationToken.startsWith('saml_')) {
    output.log(
      'Please log in to your Vercel account to complete SAML connection.'
    );
    return prompt(client, undefined, true, verificationToken.substring(5));
  }

  return { verificationToken };
}

/**
 * Attempts to detect whether CLI is running inside a "headless"
 * environment, such as inside a Docker container or in an SSH
 * session.
 */
function isHeadless() {
  return isDocker() || isSSH();
}

function isSSH() {
  return Boolean(process.env.SSH_CLIENT || process.env.SSH_TTY);
}
