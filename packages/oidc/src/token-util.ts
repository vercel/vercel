import * as path from 'path';
import { getUserDataDir } from './token-io';
import { readAuthConfig, isValidAccessToken } from './auth-config';
import { AccessTokenMissingError } from './auth-errors';

export function getVercelDataDir(): string | null {
  const vercelFolder = 'com.vercel.cli';
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return path.join(dataDir, vercelFolder);
}

export interface GetVercelTokenOptions {
  /**
   * Optional time buffer in milliseconds before token expiry to consider it expired.
   * When provided, the token will be refreshed if it expires within this buffer time.
   * @default 0
   */
  expirationBufferMs?: number;
}

export async function getVercelToken(
  options?: GetVercelTokenOptions
): Promise<string> {
  const authConfig = readAuthConfig();
  if (!authConfig?.token) {
    throw new AccessTokenMissingError();
  }

  if (isValidAccessToken(authConfig, options?.expirationBufferMs)) {
    return authConfig.token;
  }

  throw new AccessTokenMissingError();
}

interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new Error('Invalid token. Please run `vc env pull` and try again');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function isExpired(token: TokenPayload, bufferMs = 0): boolean {
  return token.exp * 1000 < Date.now() + bufferMs;
}
