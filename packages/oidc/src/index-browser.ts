export { getContext } from './get-context';
export type { AuthConfig } from './auth-config';
export { AccessTokenMissingError, RefreshFailedError } from './auth-errors';

export async function getVercelOidcToken(): Promise<string> {
  return '';
}

export function getVercelOidcTokenSync(): string {
  return '';
}

export async function getVercelCliToken(): Promise<string> {
  throw new Error('getVercelCliToken is not supported in browser environments');
}
