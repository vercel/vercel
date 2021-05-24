import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doGithubLogin(params: LoginParams) {
  const url = new URL(
    '/api/registration/login-with-github',
    // Can't use `apiUrl` here because this URL sets a
    // cookie that the OAuth callback URL depends on
    'https://vercel.com'
  );
  return doOauthLogin(params, url, 'GitHub');
}
