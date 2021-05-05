import { URL } from 'url';
import fetch from 'node-fetch';
import ua from '../ua';
import { LoginParams } from './types';

export default async function verify(
  email: string,
  verificationToken: string,
  { apiUrl, ssoUserId }: LoginParams
): Promise<string> {
  const url = new URL('/registration/verify', apiUrl);
  url.searchParams.append('email', email);
  url.searchParams.append('token', verificationToken);
  if (ssoUserId) {
    url.searchParams.append('ssoUserId', ssoUserId);
  }

  const res = await fetch(url.href, {
    headers: { 'User-Agent': ua },
  });

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
