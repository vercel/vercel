import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doBitbucketLogin(params: LoginParams) {
  const url = new URL(
    '/api/registration/bitbucket/connect',
    'https://vercel.com'
  );
  return doOauthLogin(url, 'Bitbucket', params);
}
