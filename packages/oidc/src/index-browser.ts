export { getContext } from './get-context';
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
