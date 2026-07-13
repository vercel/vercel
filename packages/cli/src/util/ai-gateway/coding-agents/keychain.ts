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

export function isKeychainAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SECURITY_BIN);
}

export function storeKeyInKeychain(key: string): boolean {
  try {
    execFileSync(
      SECURITY_BIN,
      [
        'add-generic-password',
        '-U',
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

export function keychainLookup(opts: { fish?: boolean } = {}): string {
  const cmd = `${SECURITY_BIN} find-generic-password -s '${KEYCHAIN_SERVICE}' -a '${KEYCHAIN_ACCOUNT}' -w 2>/dev/null`;
  return opts.fish ? `(${cmd})` : `$(${cmd})`;
}
