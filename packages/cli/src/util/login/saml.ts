import { URL } from 'url';
import login from '../../commands/login';
import output from '../../output-manager';
import type Client from '../client';
import { oauth } from '../oauth';
import http from 'http';
import open from 'open';
import { listen } from 'async-listen';
import prompt from './prompt';
import highlight from '../output/highlight';
import link from '../output/link';
import eraseLines from '../output/erase-lines';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import type { LoginResult, LoginResultSuccess } from './types';

export default async function doSamlLogin(
  client: Client,
  teamIdOrSlug: string,
  ssoUserId?: string
) {
  if (!client.authConfig.refreshToken) {
    output.log('Token is outdated, please log in again.');
    const exitCode = await login(client, { shouldParseArgs: false });
    if (exitCode !== 0) return exitCode;
  }

  const { session_id, client_id } = await decodeToken(client);

  const provider = 'SAML Single Sign-On';

  let result = await getVerificationToken(
    client,
    new URL(
      `https://vercel.com/sso/${teamIdOrSlug}?${new URLSearchParams({
        session_id,
        client_id,
        mode: 'login',
      })}`
    ),
    provider
  );

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

async function decodeToken(client: Client) {
  const { token } = client.authConfig;

  if (!token) {
    throw new Error(
      `No existing credentials found. Please run \`vercel login\`.`
    );
  }

  const oauthClient = await oauth.init();

  const introspectResult = await oauthClient.introspectToken(token);

  if (
    !introspectResult.active ||
    !introspectResult.session_id ||
    !introspectResult.client_id
  ) {
    throw new Error(
      `Invalid token type. Run \`vercel login\` to log-in and try again.`
    );
  }

  return {
    session_id: introspectResult.session_id,
    client_id: introspectResult.client_id,
  };
}

/**
 * Get the verification token by spawning a localhost HTTP server
 * that gets redirected to as the OAuth callback URL.
 */
async function getVerificationToken(
  client: Client,
  url: URL,
  provider: string
): Promise<LoginResult | { verificationToken: string } | number> {
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

function verify(
  client: Client,
  verificationToken: string,
  email: string | undefined,
  provider: string,
  ssoUserId?: string
) {
  const url = new URL('/registration/verify', client.apiUrl);
  url.searchParams.set('token', verificationToken);
  if (email) {
    url.searchParams.set('email', email);
  }

  if (!client.authConfig.token) {
    // Set the "name" of the Token that will be created
    const hyphens = new RegExp('-', 'g');
    const host = hostname().replace(hyphens, ' ').replace('.local', '');
    const tokenName = `${getTitleName()} CLI on ${host} via ${provider}`;
    url.searchParams.set('tokenName', tokenName);
  }

  // If `ssoUserId` is defined then this verification
  // will complete the SAML two-step login connection
  if (ssoUserId) {
    url.searchParams.set('ssoUserId', ssoUserId);
  }

  return client.fetch<LoginResultSuccess>(url.href, { useCurrentTeam: false });
}
