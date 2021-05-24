import { URL } from 'url';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doSsoLogin(teamIdOrSlug: string, params: LoginParams) {
  const url = new URL('/auth/sso', params.apiUrl);
  url.searchParams.append('teamId', teamIdOrSlug);
  return doOauthLogin(url, 'SAML Single Sign-On', params);
}
