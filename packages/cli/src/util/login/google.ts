import { URL } from 'url';
import type Client from '../client';
import doOauthLogin from './oauth';

export default function doGoogleLogin(
  client: Client,
  outOfBand?: boolean,
  ssoUserId?: string
) {
  // Can't use `apiUrl` here because this URL sets a
  // cookie that the OAuth callback URL depends on
  const url = new URL('/api/registration/google/connect', 'https://vercel.com');
  return doOauthLogin(client, url, 'Google', outOfBand, ssoUserId);
}
