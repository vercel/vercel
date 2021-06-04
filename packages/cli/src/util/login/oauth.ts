import http from 'http';
import open from 'open';
import { URL } from 'url';
import listen from 'async-listen';
import { hostname } from 'os';
import { LoginParams } from './types';
import prompt from './prompt';
import verify from './verify';
import { getTitleName } from '../pkg-name';
import highlight from '../output/highlight';

export default async function doOauthLogin(
  params: LoginParams,
  url: URL,
  provider: string
): Promise<number | string> {
  const { output } = params;

  output.spinner(
    `Please complete the ${provider} authentication in your web browser`
  );

  const server = http.createServer();
  const address = await listen(server, 0, '127.0.0.1');
  const { port } = new URL(address);
  url.searchParams.set('mode', 'login');
  url.searchParams.set('next', `http://localhost:${port}`);

  // Append token name param
  const hyphens = new RegExp('-', 'g');
  const host = hostname().replace(hyphens, ' ').replace('.local', '');
  const tokenName = `${getTitleName()} CLI on ${host} via ${provider}`;
  url.searchParams.set('tokenName', tokenName);

  try {
    const [query] = await Promise.all([
      new Promise<URL['searchParams']>((resolve, reject) => {
        server.once('request', (req, res) => {
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

    const loginError = query.get('loginError');
    if (loginError) {
      const err = JSON.parse(loginError);
      output.prettyError(err);
      return 1;
    }

    // If an `ssoUserId` was returned, then the SAML Profile is not yet connected
    // to a Team member. Prompt the user to log in to a Vercel account now, which
    // will complete the connection to the SAML Profile.
    const ssoUserId = query.get('ssoUserId');
    if (ssoUserId) {
      output.log(
        'Please log in to your Vercel account to complete SAML connection.'
      );
      return prompt({ ...params, ssoUserId });
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
    const token = await verify(email, verificationToken, params);
    output.success(
      `${provider} authentication complete for ${highlight(email)}`
    );
    return token;
  } finally {
    server.close();
  }
}
