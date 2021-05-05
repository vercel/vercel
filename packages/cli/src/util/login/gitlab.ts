import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doGitlabLogin(params: LoginParams) {
  // Can't use `apiUrl` here because this URL sets a
  // cookie that the OAuth callback URL depends on
  const url = new URL('/api/registration/gitlab/connect', 'https://vercel.com');
  return doOauthLogin(url, 'GitLab', params);
}
