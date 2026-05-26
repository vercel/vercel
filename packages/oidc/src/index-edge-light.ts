import { getVercelOidcTokenSync } from './get-vercel-oidc-token-sync';

export { getContext } from './get-context';
export {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';
export { getVercelOidcTokenSync } from './get-vercel-oidc-token-sync';

export async function getVercelOidcToken(): Promise<string> {
  return getVercelOidcTokenSync();
}

export async function getVercelToken(): Promise<string> {
  throw new Error('getVercelToken is not supported in Edge Runtime');
}
