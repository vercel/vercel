import http from 'http';
import open from 'open';
import { hostname } from 'os';
import { URL, URLSearchParams } from 'url';
import listen from 'async-listen';
import { getTitleName } from '../pkg-name';
import { LoginParams } from './types';

export default async function doSsoLogin(
  slug: string,
  { apiUrl, output }: LoginParams
): Promise<number> {
  output.print(`Logging in to team "${slug}"`);

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
    url.searchParams.append('slug', slug);
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

    const rawQuery = req.url!.slice(req.url!.indexOf('?') + 1);
    const query = new URLSearchParams(rawQuery);

    const loginError = query.get('loginError');
    if (loginError) {
      const err = JSON.parse(loginError);
      output.error(err.message);
      return 1;
    }

    console.log({ query, headers: req.headers });
  } finally {
    server.close();
  }

  return 0;
}
