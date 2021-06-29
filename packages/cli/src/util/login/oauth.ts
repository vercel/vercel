import http from 'http';
import open from 'open';
import { URL } from 'url';
import listen from 'async-listen';
import Client from '../client';
import prompt from './prompt';
import verify from './verify';
import highlight from '../output/highlight';
import link from '../output/link';
import eraseLines from '../output/erase-lines';

export default async function doOauthLogin(
  client: Client,
  url: URL,
  provider: string,
  ssoUserId?: string
): Promise<number | string> {
  const { output } = client;

  const server = http.createServer();
  const address = await listen(server, 0, '127.0.0.1');
  const { port } = new URL(address);
  url.searchParams.set('mode', 'login');
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

    const email = query.get('email');
    const verificationToken = query.get('token');
    if (!email || !verificationToken) {
      output.error(
        'Verification token was not provided. Please contact support.'
      );
      return 1;
    }

    output.spinner('Verifying authentication token');
    const token = await verify(
      client,
      email,
      verificationToken,
      provider,
      ssoUserId
    );
    output.success(
      `${provider} authentication complete for ${highlight(email)}`
    );
    return token;
  } finally {
    server.close();
  }
}
