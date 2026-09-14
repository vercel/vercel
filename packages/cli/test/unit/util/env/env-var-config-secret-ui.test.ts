import { describe, expect, it } from 'vitest';
import {
  ENV_VISIBILITY_DEPRECATION_MESSAGE,
  formatVisibilityLabel,
  getPublicPrefixSecretVisibilityError,
  isSecretEnvVar,
  resolveEnvVarTypeOption,
  resolveEnvVarVisibility,
  visibilityFromEnvType,
} from '../../../../src/util/env/env-var-config-secret-ui';

describe('resolveEnvVarTypeOption', () => {
  it('prefers the canonical --type option', () => {
    expect(resolveEnvVarTypeOption({ type: 'secret' })).toEqual({
      explicitVisibility: 'secret',
      source: 'type',
      usedDeprecatedVisibility: false,
    });
  });

  it('accepts --visibility as a deprecated alias', () => {
    expect(resolveEnvVarTypeOption({ visibility: 'config' })).toEqual({
      explicitVisibility: 'config',
      source: 'visibility',
      usedDeprecatedVisibility: true,
    });
    expect(ENV_VISIBILITY_DEPRECATION_MESSAGE).toBe(
      '`--visibility` is deprecated. Use `--type` instead.'
    );
  });

  it('accepts equal values from both options', () => {
    expect(
      resolveEnvVarTypeOption({ type: 'secret', visibility: 'secret' })
    ).toEqual({
      explicitVisibility: 'secret',
      source: 'type',
      usedDeprecatedVisibility: true,
    });
  });

  it('rejects conflicting values from both options', () => {
    expect(
      resolveEnvVarTypeOption({ type: 'config', visibility: 'secret' })
    ).toEqual({
      usedDeprecatedVisibility: true,
      error:
        '`--type config` conflicts with `--visibility secret`. `--visibility` is a deprecated alias of `--type`; remove it.',
      errorReason: 'conflicting_type_visibility',
    });
  });

  it('rejects invalid canonical and deprecated values before command prompts', () => {
    expect(resolveEnvVarTypeOption({ type: 'bogus' }).error).toBe(
      'The `--type` flag must be either `config` or `secret`.'
    );
    expect(resolveEnvVarTypeOption({ type: 'bogus' }).errorReason).toBe(
      'invalid_type'
    );
    expect(resolveEnvVarTypeOption({ visibility: 'sensitive' }).error).toBe(
      'The `--visibility` flag accepts `config` or `secret`. Use `--type secret` or the legacy `--sensitive` flag.'
    );
    expect(
      resolveEnvVarTypeOption({ visibility: 'sensitive' }).errorReason
    ).toBe('invalid_visibility');
  });
});

describe('isSecretEnvVar', () => {
  it('supports legacy and visibility-only Secret records', () => {
    expect(isSecretEnvVar({ type: 'sensitive' })).toBe(true);
    expect(isSecretEnvVar({ type: 'encrypted', visibility: 'secret' })).toBe(
      true
    );
    expect(isSecretEnvVar({ type: 'encrypted', visibility: 'config' })).toBe(
      false
    );
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
  it('returns an error for Secret on public-prefixed keys', () => {
    expect(
      getPublicPrefixSecretVisibilityError('NEXT_PUBLIC_API_URL', {
        visibility: 'secret',
        type: 'encrypted',
      })
    ).toBe(
      '`NEXT_PUBLIC_` exposes this value to anyone visiting your site, so `NEXT_PUBLIC_API_URL` cannot be a Secret. To keep it private, rename the variable to `API_URL` and keep the Secret type. If the value is safe to expose, use `--type config`.'
    );
  });

  it('returns null for config visibility on public-prefixed keys', () => {
    expect(
      getPublicPrefixSecretVisibilityError('NEXT_PUBLIC_API_URL', {
        visibility: 'config',
        type: 'encrypted',
      })
    ).toBeNull();
  });

  it('uses add-and-remove recovery for updates', () => {
    expect(
      getPublicPrefixSecretVisibilityError('NEXT_PUBLIC_API_KEY', {
        visibility: 'secret',
        type: 'encrypted',
        context: 'update',
      })
    ).toBe(
      '`NEXT_PUBLIC_` exposes this value to anyone visiting your site, so `NEXT_PUBLIC_API_KEY` cannot be a Secret. To keep it private, add `API_KEY` as a Secret, then remove `NEXT_PUBLIC_API_KEY`. If the value is safe to expose, keep it as Config.'
    );
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
  it('uses explicit --type when provided', () => {
    expect(
      resolveEnvVarVisibility({
        explicitVisibility: 'config',
        type: 'sensitive',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      })
    ).toEqual({ visibility: 'config' });
  });

  it('names --type in invalid canonical option errors', () => {
    expect(
      resolveEnvVarVisibility({
        explicitVisibility: 'invalid',
        explicitOptionSource: 'type',
        type: 'encrypted',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toBe('The `--type` flag must be either `config` or `secret`.');
  });

  it('names the deprecated alias in invalid --visibility errors', () => {
    expect(
      resolveEnvVarVisibility({
        explicitVisibility: 'invalid',
        explicitOptionSource: 'visibility',
        type: 'encrypted',
        key: 'API_KEY',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toBe('The `--visibility` flag must be either `config` or `secret`.');
  });

  it('errors when explicit secret visibility is used on public-prefixed keys', () => {
    expect(
      resolveEnvVarVisibility({
        explicitVisibility: 'secret',
        type: 'encrypted',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/cannot be a Secret/);
  });

  it('infers visibility from type when not explicitly provided', () => {
    expect(
      resolveEnvVarVisibility({
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
        type: 'sensitive',
        key: 'NEXT_PUBLIC_API_URL',
        envTargets: ['production'],
        teamSensitivePolicyOn: false,
      }).error
    ).toMatch(/cannot be a Secret/);
  });

  it('allows secrets on Development', () => {
    expect(
      resolveEnvVarVisibility({
        type: 'sensitive',
        key: 'API_KEY',
        envTargets: ['development'],
        teamSensitivePolicyOn: false,
      })
    ).toEqual({ visibility: 'secret' });
  });
});
