import { URL } from 'url';
import doOauthLogin from './oauth';
import type Client from '../client';

export default function doBitbucketLogin(
  client: Client,
  outOfBand?: boolean,
  ssoUserId?: string,
) {
  const url = new URL(
    '/api/registration/bitbucket/connect',
    // Can't use `apiUrl` here because this URL sets a
    // cookie that the OAuth callback URL depends on
    'https://vercel.com',
  );
  return doOauthLogin(client, url, 'Bitbucket', outOfBand, ssoUserId);
}
