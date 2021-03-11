import http from 'http';
import open from 'open';
import fetch from 'node-fetch';
import { hostname } from 'os';
import { URL } from 'url';
import listen from 'async-listen';
import { getTitleName } from '../pkg-name';
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
    const [req] = await Promise.all([
      new Promise<http.IncomingMessage>((resolve, reject) => {
        server.once('request', (req, res) => {
          resolve(req);

          // Redirect the user's web browser back
          // to the Vercel email confirmation page
          res.statusCode = 302;
          // TODO: maybe a dedicated page for CLI login success?
          res.setHeader(
            'location',
            'https://vercel.com/notifications/email-confirmed'
          );
          res.end();
        });
        server.once('error', reject);
      }),
      open(url.href),
    ]);

    const query = new URL(req.url || '/', 'http://localhost').searchParams;

    const loginError = query.get('loginError');
    if (loginError) {
      const err = JSON.parse(loginError);
      output.error(err.message);
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

    output.success(`SAML authentication complete`);
    const body = await verifyRes.json();
    return body.token;
  } finally {
    server.close();
  }
}
