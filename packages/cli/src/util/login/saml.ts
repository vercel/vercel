import { URL } from 'url';
import Client from '../client';
import doOauthLogin from './oauth';

export default function doSamlLogin(
  client: Client,
  teamIdOrSlug: string,
  outOfBand?: boolean,
  ssoUserId?: string
) {
  const url = new URL('/auth/sso', client.apiUrl);
  url.searchParams.set('teamId', teamIdOrSlug);
  return doOauthLogin(client, url, 'SAML Single Sign-On', outOfBand, ssoUserId);
}
