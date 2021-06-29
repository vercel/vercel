import { URL } from 'url';
import Client from '../client';
import doOauthLogin from './oauth';

export default function doSsoLogin(client: Client, teamIdOrSlug: string) {
  const url = new URL('/auth/sso', client.apiUrl);
  url.searchParams.set('teamId', teamIdOrSlug);
  return doOauthLogin(client, url, 'SAML Single Sign-On');
}
