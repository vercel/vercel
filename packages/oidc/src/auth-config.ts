import {
  clearAllCredentialsStrict,
  hasCredentials,
  readCredentials,
  writeCredentials,
  type Credentials,
} from '@vercel/cli-auth/credentials-store.js';
import { getVercelDataDir } from './token-util';

/**
 * Auth configuration stored in ~/.../com.vercel.cli/auth.json or OS keyring
 */
export type AuthConfig = Credentials;

/**
 * Get the path to the auth config directory
 */
function getAuthConfigDir(): string {
  const dataDir = getVercelDataDir();
  if (!dataDir) {
    throw new Error(
      `Unable to find Vercel CLI data directory. Your platform: ${process.platform}. Supported: darwin, linux, win32.`
    );
  }

  return dataDir;
}

/**
 * Read the auth config from disk
 * Returns null if the file doesn't exist or cannot be read
 */
export function readAuthConfig(): AuthConfig | null {
  try {
    return readCredentials(getAuthConfigDir());
  } catch (_error) {
    return null;
  }
}

/**
 * Write the auth config to disk with proper permissions
 */
export function writeAuthConfig(config: AuthConfig): void {
  if (hasCredentials(config)) {
    writeCredentials(getAuthConfigDir(), config);
    return;
  }

  clearAllCredentialsStrict(getAuthConfigDir());
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
