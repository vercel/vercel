import { URL } from 'url';
import doOauthLogin from './oauth';
import type Client from '../client';

export default function doSamlLogin(
  client: Client,
  teamIdOrSlug: string,
  outOfBand?: boolean,
  ssoUserId?: string,
) {
  const url = new URL('/auth/sso', client.apiUrl);
  url.searchParams.set('teamId', teamIdOrSlug);
  return doOauthLogin(client, url, 'SAML Single Sign-On', outOfBand, ssoUserId);
}
