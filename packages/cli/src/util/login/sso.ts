import http from 'http';
import open from 'open';
import fetch from 'node-fetch';
import { hostname } from 'os';
import { URL } from 'url';
import listen from 'async-listen';
import { getTitleName } from '../pkg-name';
import highlight from '../output/highlight';
import { LoginParams } from './types';

export default async function doSsoLogin(
  teamIdOrSlug: string,
  { apiUrl, output }: LoginParams
): Promise<number | string> {
  output.print(`Logging in to team "${teamIdOrSlug}"`);

  const hyphens = new RegExp('-', 'g');
  const host = hostname().replace(hyphens, ' ').replace('.local', '');
  const tokenName = `${getTitleName()} CLI on ${host}`;

  const server = http.createServer();
  const address = await listen(server);
  const { port } = new URL(address);

  try {
    const url = new URL('/registration/sso/auth', apiUrl);
    url.searchParams.append('mode', 'login');
    url.searchParams.append('next', `http://localhost:${port}`);
    url.searchParams.append('teamId', teamIdOrSlug);
    url.searchParams.append('tokenName', tokenName);

    output.spinner(
      'Please complete the SAML Single Sign-On authentication in your web browser'
    );
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
          if (loginError) {
            location.pathname += 'failed';
            location.searchParams.set('loginError', loginError);
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

    const email = query.get('email');
    const verificationToken = query.get('token');
    if (!email || !verificationToken) {
      output.error(
        'Verification token was not provided. Please contact support.'
      );
      return 1;
    }

    output.spinner('Verifying authentication token');
    const verifyUrl = new URL('/registration/verify', apiUrl);
    verifyUrl.searchParams.append('email', email);
    verifyUrl.searchParams.append('token', verificationToken);

    const verifyRes = await fetch(verifyUrl.href);

    if (!verifyRes.ok) {
      output.error(
        `Unexpected ${verifyRes.status} status code from verify API`
      );
      output.debug(await verifyRes.text());
      return 1;
    }

    output.success(`SAML authentication complete for ${highlight(email)}`);
    const body = await verifyRes.json();
    return body.token;
  } finally {
    server.close();
  }
}
