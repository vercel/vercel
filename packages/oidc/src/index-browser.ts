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

export async function getVercelCliToken(): Promise<string> {
  throw new Error('getVercelCliToken is not supported in browser environments');
}
