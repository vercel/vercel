import { URL } from 'url';
import Client from '../client';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import {
  LoginResultSuccess,
  phoneVerificationResult,
  phoneCodeVerificationResult,
} from './types';

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
export function verifySignUp(
  client: Client,
  verificationToken: string,
  email: string | undefined,
  provider: string,
  plan: string,
  teamName: string,
  ssoUserId?: string
) {
  const url = new URL('/registration/verify', client.apiUrl);
  url.searchParams.set('token', verificationToken);
  if (email) {
    url.searchParams.set('email', email);
  }
  if (plan) {
    url.searchParams.set('teamPlan', plan);
  }
  if (teamName) {
    url.searchParams.set('teamName', teamName);
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
export async function verifyPhone(
  client: Client,
  //verificationToken: string,
  email: string | undefined,
  phone: string,
  countryCode: string
) {
  const url = new URL(
    'https://vercel.com/api/v2/registration/start-verify-phone'
  );

  if (!email || !phone) return;

  url.searchParams.set('email', email);
  url.searchParams.set(
    'phone',
    phone.replace(/^(.{4})(.{6})(.*)$/, '$1 $2 $3')
  );

  if (countryCode) {
    url.searchParams.set('country', countryCode);
  }
  return client.fetch<phoneVerificationResult>(url.href, {
    useCurrentTeam: false,
    method: 'POST',
  });
}
export async function verifyPhoneCode(
  client: Client,
  email: string | undefined,
  phone: string,
  countryCode: string,
  code: string
): Promise<phoneCodeVerificationResult> {
  const url = new URL(
    'https://vercel.com/api/v2/registration/check-verify-phone'
  );

  if (!email || !code)
    return { status: '', error: { code: '', message: '', status: '' } };

  url.searchParams.set('email', email);
  url.searchParams.set(
    'phone',
    phone.replace(/^(.{4})(.{6})(.*)$/, '$1 $2 $3')
  );
  url.searchParams.set('code', code);

  if (countryCode) {
    url.searchParams.set('country', countryCode);
  }
  return client.fetch<phoneCodeVerificationResult>(url.href, {
    useCurrentTeam: false,
    method: 'POST',
  });
}
