import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Optional macOS Keychain storage for the AI Gateway key. When available the
 * secret stays in the login keychain and the shell rc resolves it at runtime,
 * so the plaintext key never lands in a config file. Everything here is a
 * no-op (or returns `false`) off macOS, so callers fall back to writing the key
 * directly.
 */
const SECURITY_BIN = '/usr/bin/security';

/** Which generic-password item holds the key. Hosts that keep their own item pass it in. */
export interface KeychainItem {
  service: string;
  account: string;
}

export const DEFAULT_KEYCHAIN_ITEM: KeychainItem = {
  service: 'Vercel AI Gateway',
  account: 'vercel-ai-gateway',
};

// The lookup is spliced into shell files inside single quotes.
const SAFE_ATTRIBUTE = /^[A-Za-z0-9 ._-]+$/;

function checkedItem(item: KeychainItem): KeychainItem {
  if (
    !SAFE_ATTRIBUTE.test(item.service) ||
    !SAFE_ATTRIBUTE.test(item.account)
  ) {
    throw new Error(
      'Keychain service and account may only contain letters, digits, spaces, ".", "_" and "-".'
    );
  }
  return item;
}

export function isKeychainAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SECURITY_BIN);
}

export function storeKeyInKeychain(
  key: string,
  item: KeychainItem = DEFAULT_KEYCHAIN_ITEM
): boolean {
  const { service, account } = checkedItem(item);
  try {
    execFileSync(
      SECURITY_BIN,
      ['add-generic-password', '-U', '-s', service, '-a', account, '-w', key],
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

export function readKeyFromKeychain(
  item: KeychainItem = DEFAULT_KEYCHAIN_ITEM
): string | undefined {
  if (!isKeychainAvailable()) {
    return undefined;
  }
  const { service, account } = checkedItem(item);
  try {
    const out = execFileSync(
      SECURITY_BIN,
      ['find-generic-password', '-s', service, '-a', account, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** The command substitution a shell rc uses to read the key at startup. */
export function keychainLookup(
  opts: { fish?: boolean; item?: KeychainItem } = {}
): string {
  const { service, account } = checkedItem(opts.item ?? DEFAULT_KEYCHAIN_ITEM);
  const cmd = `${SECURITY_BIN} find-generic-password -s '${service}' -a '${account}' -w 2>/dev/null`;
  return opts.fish ? `(${cmd})` : `$(${cmd})`;
}
