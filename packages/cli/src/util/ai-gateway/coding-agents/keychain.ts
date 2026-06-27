import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Optional macOS Keychain storage for the AI Gateway key. When available we keep
 * the secret in the login keychain and have the shell rc resolve it at runtime,
 * so the plaintext key never lands in a config file. Everything here is a no-op
 * (or returns `false`) off macOS, so callers fall back to writing the key
 * directly.
 */
const SECURITY_BIN = '/usr/bin/security';
const KEYCHAIN_SERVICE = 'Vercel AI Gateway';
const KEYCHAIN_ACCOUNT = 'vercel-ai-gateway';

/** True only on macOS with the `security` CLI present. */
export function isKeychainAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SECURITY_BIN);
}

/**
 * Stores (or updates) the key in the login keychain. Returns `false` on any
 * failure so the caller can fall back to writing the key into the config.
 */
export function storeKeyInKeychain(key: string): boolean {
  try {
    execFileSync(
      SECURITY_BIN,
      [
        'add-generic-password',
        '-U', // update the existing item instead of erroring
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        KEYCHAIN_ACCOUNT,
        '-w',
        key,
      ],
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * A shell command substitution that resolves the stored key at runtime, for use
 * as an `export VAR="<this>"` value in the managed rc block.
 */
export function keychainLookup(): string {
  return `$(${SECURITY_BIN} find-generic-password -s '${KEYCHAIN_SERVICE}' -a '${KEYCHAIN_ACCOUNT}' -w 2>/dev/null)`;
}
