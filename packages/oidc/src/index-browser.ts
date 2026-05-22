export { getContext } from './get-context';
export {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';
export {
  isValidVercelOidcToken,
  assertValidVercelOidcToken,
  UnacceptableVercelOidcTokenError,
} from './validate';
export type { VercelOidcTokenMatcher, VercelOidcTokenClaims } from './validate';

export async function getVercelOidcToken(): Promise<string> {
  return '';
}

export function getVercelOidcTokenSync(): string {
  return '';
}

export async function getVercelToken(): Promise<string> {
  throw new Error('getVercelToken is not supported in browser environments');
}
