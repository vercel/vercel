export { getContext } from './get-context';
export type { GetVercelOidcTokenOptions } from './get-vercel-oidc-token';
export type { AuthConfig } from './auth-config';
export {
  NoAuthError,
  TokenExpiredError,
  RefreshFailedError,
} from './auth-errors';

export async function getVercelOidcToken(): Promise<string> {
  return '';
}

export function getVercelOidcTokenSync(): string {
  return '';
}

export function readAuthConfig(): null {
  return null;
}

export function writeAuthConfig(): void {
  // No-op in browser
}

export function isValidAccessToken(): boolean {
  return false;
}

export async function getVercelCliToken(): Promise<string> {
  throw new Error('getVercelCliToken is not supported in browser environments');
}
