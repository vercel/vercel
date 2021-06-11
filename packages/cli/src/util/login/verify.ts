import { URL } from 'url';
import fetch, { Headers } from 'node-fetch';
import ua from '../ua';
import { LoginParams } from './types';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';

export default async function verify(
  email: string,
  verificationToken: string,
  provider: string,
  { authConfig, apiUrl, ssoUserId }: LoginParams
): Promise<string> {
  const url = new URL('/registration/verify', apiUrl);
  url.searchParams.set('email', email);
  url.searchParams.set('token', verificationToken);

  const headers = new Headers({ 'User-Agent': ua });

  if (authConfig.token) {
    // If there is already an auth token then it will be
    // upgraded, rather than a new token being created
    headers.set('Authorization', `Bearer ${authConfig.token}`);
  } else {
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

  const res = await fetch(url.href, { headers });
  const body = await res.json();

  if (!res.ok) {
    const err = new Error(
      `Unexpected ${res.status} status code from verify API`
    );
    Object.assign(err, body.error);
    throw err;
  }

  return body.token;
}
