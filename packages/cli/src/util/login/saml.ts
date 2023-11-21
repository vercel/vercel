import { URL } from 'node:url';
import Client from '../client.js';
import doOauthLogin from './oauth.js';

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
