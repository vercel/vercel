import { URL } from 'url';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default function doSsoLogin(teamIdOrSlug: string, params: LoginParams) {
  const { apiUrl } = params;

  const hyphens = new RegExp('-', 'g');
  const host = hostname().replace(hyphens, ' ').replace('.local', '');
  const tokenName = `${getTitleName()} CLI on ${host}`;

  const url = new URL('/auth/sso', apiUrl);
  url.searchParams.append('teamId', teamIdOrSlug);
  url.searchParams.append('tokenName', tokenName);

  return doOauthLogin(url, 'SAML Single Sign-On', params);
}
