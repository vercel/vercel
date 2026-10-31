import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYCHAIN_ITEM, keychainLookup } from '../src/keychain';

describe('keychainLookup', () => {
  it('reads the CLI item by default', () => {
    expect(keychainLookup()).toBe(
      "$(/usr/bin/security find-generic-password -s 'Vercel AI Gateway' -a 'vercel-ai-gateway' -w 2>/dev/null)"
    );
    expect(DEFAULT_KEYCHAIN_ITEM.account).toBe('vercel-ai-gateway');
  });

  it('reads a host item, in fish syntax too', () => {
    expect(
      keychainLookup({
        fish: true,
        item: { service: 'Vercel AI Gateway', account: 'vercel-desktop-key' },
      })
    ).toBe(
      "(/usr/bin/security find-generic-password -s 'Vercel AI Gateway' -a 'vercel-desktop-key' -w 2>/dev/null)"
    );
  });

  it("refuses attributes that would break out of the shell's quotes", () => {
    expect(() =>
      keychainLookup({ item: { service: "x' ; rm -rf ~ ; '", account: 'a' } })
    ).toThrow();
  });
});
