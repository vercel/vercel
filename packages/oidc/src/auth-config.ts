import * as fs from 'fs';
import * as path from 'path';
import { getVercelDataDir } from './token-util';

/**
 * Auth configuration stored in ~/.../com.vercel.cli/auth.json
 */
export interface AuthConfig {
  /** An `access_token` obtained using the OAuth Device Authorization flow. */
  token?: string;
  /**
   * The absolute time (seconds) when the token expires.
   * Used to optimistically check if the token is still valid.
   */
  expiresAt?: number;
}

/**
 * Get the path to the auth config file
 */
function getAuthConfigPath(): string {
  const dataDir = getVercelDataDir();
  if (!dataDir) {
    throw new Error(
      `Unable to find Vercel CLI data directory. Your platform: ${process.platform}. Supported: darwin, linux, win32.`
    );
  }
  return path.join(dataDir, 'auth.json');
}

/**
 * Read the auth config from disk
 * Returns null if the file doesn't exist or cannot be read
 */
export function readAuthConfig(): AuthConfig | null {
  try {
    const authPath = getAuthConfigPath();
    if (!fs.existsSync(authPath)) {
      return null;
    }
    const content = fs.readFileSync(authPath, 'utf8');
    if (!content) {
      return null;
    }
    return JSON.parse(content) as AuthConfig;
  } catch (error) {
    return null;
  }
}

/**
 * Check if an access token is valid (not expired)
 * Copied from packages/cli/src/util/client.ts:72-81
 */
export function isValidAccessToken(
  authConfig: AuthConfig,
  expirationBufferMs = 0
): boolean {
  if (!authConfig.token) return false;

  // When `--token` is passed to a command, `expiresAt` will be missing.
  // We assume the token is valid in this case and handle errors further down.
  if (typeof authConfig.expiresAt !== 'number') return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const bufferInSeconds = expirationBufferMs / 1000;
  return authConfig.expiresAt >= nowInSeconds + bufferInSeconds;
}
