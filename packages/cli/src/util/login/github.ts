import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doGithubLogin(params: LoginParams) {
  const url = new URL(
    '/api/registration/login-with-github',
    'https://vercel.com'
  );
  return doOauthLogin(url, 'GitHub', params);
}
