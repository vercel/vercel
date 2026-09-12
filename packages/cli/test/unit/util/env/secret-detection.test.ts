import { describe, expect, it } from 'vitest';
import {
  getMatchingServerOnlyKey,
  isFlagsSecretNeedingSplit,
  looksLikeSecret,
  looksLikeSecretValue,
  shouldConfirmRotationBeforeDelete,
} from '../../../../src/util/env/secret-detection';

describe('secret detection', () => {
  it.each([
    ['DATABASE_URL', true],
    ['STRIPE_API_KEY', true],
    ['STRIPE_PUBLISHABLE_KEY', false],
    ['CACHE_KEY', false],
    ['MONKEY_NAME', false],
  ])('classifies key %s', (key, expected) => {
    expect(looksLikeSecret(key)).toBe(expected);
  });

  it('matches server-only compound names before generic tokens', () => {
    expect(getMatchingServerOnlyKey('DATABASE_ACCESS_TOKEN')).toBe(
      'access_token'
    );
  });

  it('detects credential formats without exposing their value', () => {
    expect(looksLikeSecretValue(`ghp_${'a'.repeat(30)}`)).toBe(true);
    expect(looksLikeSecretValue('ordinary-config-value')).toBe(false);
  });

  it('requires rotation guidance for credential-like deletes', () => {
    expect(
      shouldConfirmRotationBeforeDelete({
        key: 'STRIPE_SECRET_KEY',
        type: 'sensitive',
        hasPublicPrefix: false,
      })
    ).toBe(true);
    expect(
      shouldConfirmRotationBeforeDelete({
        key: 'NEXT_PUBLIC_API_URL',
        type: 'encrypted',
        hasPublicPrefix: true,
      })
    ).toBe(false);
  });

  it('recommends splitting readable FLAGS_SECRET outside Development', () => {
    expect(
      isFlagsSecretNeedingSplit({
        key: 'FLAGS_SECRET',
        type: 'encrypted',
        targets: ['production', 'preview'],
      })
    ).toBe(true);
    expect(
      isFlagsSecretNeedingSplit({
        key: 'FLAGS_SECRET',
        type: 'encrypted',
        targets: ['production'],
      })
    ).toBe(false);
    expect(
      isFlagsSecretNeedingSplit({
        key: 'FLAGS_SECRET',
        type: 'encrypted',
        targets: ['development'],
      })
    ).toBe(false);
  });
});
