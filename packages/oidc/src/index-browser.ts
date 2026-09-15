import type { ExchangeVercelOidcTokenOptions } from './exchange-vercel-oidc-token';

export type { ExchangeVercelOidcTokenOptions } from './exchange-vercel-oidc-token';
export { getContext } from './get-context';
export {
  verifyVercelOidcToken,
  type VercelOidcPayload,
} from './verify-vercel-oidc-token';
export {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';

export async function getVercelOidcToken(): Promise<string> {
  return '';
}

export function getVercelOidcTokenSync(): string {
  return '';
}

export async function getVercelToken(): Promise<string> {
  throw new Error('getVercelToken is not supported in browser environments');
}

export async function exchangeVercelOidcToken(
  _options: ExchangeVercelOidcTokenOptions
): Promise<string> {
  throw new Error(
    'exchangeVercelOidcToken is not supported in browser environments'
  );
}
