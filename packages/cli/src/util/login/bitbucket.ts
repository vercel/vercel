import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doBitbucketLogin(params: LoginParams) {
  const url = new URL(
    '/api/registration/bitbucket/connect',
    // Can't use `apiUrl` here because this URL sets a
    // cookie that the OAuth callback URL depends on
    'https://vercel.com'
  );
  return doOauthLogin(url, 'Bitbucket', params);
}
