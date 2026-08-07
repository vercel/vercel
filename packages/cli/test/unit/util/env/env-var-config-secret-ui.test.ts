import { afterEach, describe, expect, it } from 'vitest';
import {
  formatVisibilityLabel,
  getPublicPrefixSecretVisibilityError,
  isEnvVarConfigSecretUiEnabled,
  resolveEnvVarVisibility,
  shouldEnforceSensitiveEnvVarPolicy,
  visibilityFromEnvType,
} from '../../../../src/util/env/env-var-config-secret-ui';

describe('isEnvVarConfigSecretUiEnabled', () => {
  const original = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
    } else {
      process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = original;
    }
  });

  it('is disabled by default', () => {
    delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
    expect(isEnvVarConfigSecretUiEnabled()).toBe(false);
  });

  it.each([
    '1',
    'true',
    'TRUE',
    'on',
    'ON',
  ])('is enabled when VERCEL_ENV_VAR_CONFIG_SECRET_UI=%s', value => {
    process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = value;
    expect(isEnvVarConfigSecretUiEnabled()).toBe(true);
  });

  it('is disabled for other values', () => {
    process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = '0';
    expect(isEnvVarConfigSecretUiEnabled()).toBe(false);
  });
});

describe('shouldEnforceSensitiveEnvVarPolicy', () => {
  const original = process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
    } else {
      process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = original;
    }
  });

  it('enforces policy when the env var flag is off', () => {
    delete process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI;
    expect(shouldEnforceSensitiveEnvVarPolicy(true)).toBe(true);
    expect(shouldEnforceSensitiveEnvVarPolicy(false)).toBe(false);
  });

  it('skips policy when the env var flag is on', () => {
    process.env.VERCEL_ENV_VAR_CONFIG_SECRET_UI = '1';
    expect(shouldEnforceSensitiveEnvVarPolicy(true)).toBe(false);
  });
});

describe('visibilityFromEnvType', () => {
  it('maps encrypted and plain types to config', () => {
    expect(visibilityFromEnvType('encrypted')).toBe('config');
    expect(visibilityFromEnvType('plain')).toBe('config');
  });

  it('maps sensitive type to secret', () => {
    expect(visibilityFromEnvType('sensitive')).toBe('secret');
  });

  it('returns undefined for system', () => {
    expect(visibilityFromEnvType('system')).toBeUndefined();
  });
});

describe('getPublicPrefixSecretVisibilityError', () => {
  it('returns an error for secret visibility on public-prefixed production keys', () => {
    expect(
      getPublicPrefixSecretVisibilityError('NEXT_PUBLIC_API_URL', {
        visibility: 'secret',
        type: 'encrypted',
        envTargets: ['production'],
      })
    ).toMatch(/cannot use secret visibility on Production or Preview/);
  });

  it('returns null for config visibility on public-prefixed keys', () => {
    expect(
      getPublicPrefixSecretVisibilityError('NEXT_PUBLIC_API_URL', {
        visibility: 'config',
        type: 'encrypted',
        envTargets: ['production'],
      })
    ).toBeNull();
  });
});

describe('formatVisibilityLabel', () => {
  it('formats explicit visibility values', () => {
    expect(formatVisibilityLabel('config', 'encrypted')).toBe('Config');
    expect(formatVisibilityLabel('secret', 'sensitive')).toBe('Secret');
  });

  it('infers visibility from type when not provided', () => {
    expect(formatVisibilityLabel(undefined, 'encrypted')).toBe('Config');
    expect(formatVisibilityLabel(undefined, 'sensitive')).toBe('Secret');
  });
});

describe('resolveEnvVarVisibility', () => {
  it('returns nothing when the flag is disabled', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: false,
        type: 'sensitive',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      })
    ).toEqual({});
  });

  it('uses explicit --visibility when provided', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        explicitVisibility: 'config',
        type: 'sensitive',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      })
    ).toEqual({ visibility: 'config' });
  });

  it('errors on invalid explicit visibility values', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        explicitVisibility: 'invalid',
        type: 'encrypted',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/must be either `config` or `secret`/);
  });

  it('errors when explicit secret visibility is used on public-prefixed keys', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        explicitVisibility: 'secret',
        type: 'encrypted',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/cannot use secret visibility/);
  });

  it('infers visibility from type when not explicitly provided', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        type: 'encrypted',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      })
    ).toEqual({ visibility: 'config' });
  });

  it('omits inferred visibility for public-prefixed keys when team policy force-coerces type', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        type: 'encrypted',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: true,
      })
    ).toEqual({});
  });

  it('does not omit inferred visibility for public-prefixed keys when only type is sensitive', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        type: 'sensitive',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/cannot use secret visibility/);
  });

  it('errors when sensitive type is requested on public-prefixed production keys', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        type: 'sensitive',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/cannot use secret visibility/);
  });

  it('rejects secrets on Development when flag is enabled', () => {
    expect(
      resolveEnvVarVisibility({
        configSecretUiEnabled: true,
        type: 'sensitive',
        key: 'API_KEY',
        envTargets: ['development'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/not allowed with the Development Environment/);
  });
});
