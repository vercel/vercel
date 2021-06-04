import { URL } from 'url';
import fetch, { Headers } from 'node-fetch';
import ua from '../ua';
import { LoginParams } from './types';

export default async function verify(
  email: string,
  verificationToken: string,
  { authConfig, apiUrl, ssoUserId }: LoginParams
): Promise<string> {
  const url = new URL('/registration/verify', apiUrl);
  url.searchParams.set('email', email);
  url.searchParams.set('token', verificationToken);
  if (ssoUserId) {
    url.searchParams.set('ssoUserId', ssoUserId);
  }

  const headers = new Headers({ 'User-Agent': ua });
  if (authConfig.token) {
    headers.set('Authorization', `Bearer ${authConfig.token}`);
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
