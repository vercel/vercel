import { URL } from 'url';
import doOauthLogin from './oauth';
import type Client from '../client';

export default function doGitlabLogin(
  client: Client,
  outOfBand?: boolean,
  ssoUserId?: string,
) {
  // Can't use `apiUrl` here because this URL sets a
  // cookie that the OAuth callback URL depends on
  const url = new URL('/api/registration/gitlab/connect', 'https://vercel.com');
  return doOauthLogin(client, url, 'GitLab', outOfBand, ssoUserId);
}
