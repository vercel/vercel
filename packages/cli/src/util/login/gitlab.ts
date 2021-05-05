import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doGitlabLogin(params: LoginParams) {
  const url = new URL('/api/registration/gitlab/connect', 'https://vercel.com');
  return doOauthLogin(url, 'GitLab', params);
}
