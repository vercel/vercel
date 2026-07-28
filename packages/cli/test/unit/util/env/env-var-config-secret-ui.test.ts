import { afterEach, describe, expect, it } from 'vitest';
import {
  isEnvVarConfigSecretUiEnabled,
  shouldEnforceSensitiveEnvVarPolicy,
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
