import { URL } from 'url';
import Client from '../client';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import { LoginResultSuccess } from './types';

export default function verify(
  client: Client,
  verificationToken: string,
  email: string | undefined,
  provider: string,
  ssoUserId?: string
) {
  const url = new URL('/registration/verify', client.apiUrl);
  url.searchParams.set('token', verificationToken);
  if (email) {
    url.searchParams.set('email', email);
  }

  if (!client.authConfig.token) {
    // Set the "name" of the Token that will be created
    const hyphens = new RegExp('-', 'g');
    const host = hostname().replace(hyphens, ' ').replace('.local', '');
    const tokenName = `${getTitleName()} CLI on ${host} via ${provider}`;
    url.searchParams.set('tokenName', tokenName);
  }

  // If `ssoUserId` is defined then this verification
  // will complete the SAML two-step login connection
  if (ssoUserId) {
    url.searchParams.set('ssoUserId', ssoUserId);
  }

  return client.fetch<LoginResultSuccess>(url.href, { useCurrentTeam: false });
}
