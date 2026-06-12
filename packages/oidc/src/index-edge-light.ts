import { getVercelOidcTokenSync } from './get-vercel-oidc-token-sync';

export { getContext } from './get-context';
export {
  verifyVercelOidcToken,
  type VercelOidcPayload,
} from './verify-vercel-oidc-token';
export {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';
export { getVercelOidcTokenSync } from './get-vercel-oidc-token-sync';

/**
 * Gets the current OIDC token in Edge Runtime.
 *
 * Edge Runtime does not support automatic token refresh, so this returns the
 * request-scoped token without checking expiration.
 */
export async function getVercelOidcToken(): Promise<string> {
  return getVercelOidcTokenSync();
}

export async function getVercelToken(): Promise<string> {
  throw new Error('getVercelToken is not supported in Edge Runtime');
}
