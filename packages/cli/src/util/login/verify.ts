import { URL } from 'url';
import ua from '../ua';
import Client from '../client';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import { VerifyData } from './types';

export default async function verify(
  client: Client,
  email: string,
  verificationToken: string,
  provider: string,
  ssoUserId?: string
): Promise<string> {
  const url = new URL('/registration/verify', client.apiUrl);
  url.searchParams.set('email', email);
  url.searchParams.set('token', verificationToken);

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

  const { token } = await client.fetch<VerifyData>(url.href, {
    headers: { 'User-Agent': ua },
  });
  return token;
}
