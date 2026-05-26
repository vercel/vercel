import { describe, expect, it } from 'vitest';
import { fileNameSymbol } from '@vercel/client';
import { validateExperimentalEnvironmentVariables } from '../../../src/util/validate-experimental-environment-variables';
import type { VercelConfig } from '../../../src/util/dev/types';

describe('validateExperimentalEnvironmentVariables', () => {
  const baseConfig = {
    [fileNameSymbol]: 'vercel.json',
    experimentalEnvironmentVariables: {
      NEON_DB_PASSWORD: {
        type: 'secret' as const,
        required: true,
        allowNonSecretDevelopment: true,
      },
      STRIPE_SK: {
        type: 'secret' as const,
        required: ['production' as const],
        allowNonSecretDevelopment: true,
      },
      NEON_DB_URL: {
        type: 'config' as const,
        required: true,
      },
    },
  } satisfies VercelConfig;

  it('returns null when experimentalEnvironmentVariables is not defined', () => {
    const error = validateExperimentalEnvironmentVariables(
      {},
      {
        environment: 'preview',
        env: {},
      }
    );
    expect(error).toBeNull();
  });

  it('returns null when all required variables are set', () => {
    const error = validateExperimentalEnvironmentVariables(baseConfig, {
      environment: 'preview',
      env: {
        NEON_DB_PASSWORD: 'secret-value',
        NEON_DB_URL: 'postgres://example',
      },
    });
    expect(error).toBeNull();
  });

  it('errors when a required variable is missing', () => {
    const error = validateExperimentalEnvironmentVariables(baseConfig, {
      environment: 'preview',
      env: {
        NEON_DB_PASSWORD: 'secret-value',
      },
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('EXPERIMENTAL_ENVIRONMENT_VARIABLES');
    expect(error!.message).toContain('`NEON_DB_URL`');
    expect(error!.message).toContain('preview');
    expect(error!.message).toContain('vercel env add');
    expect(error!.message).toContain('vercel env pull');
  });

  it('does not require environment-specific variables outside their target', () => {
    const error = validateExperimentalEnvironmentVariables(baseConfig, {
      environment: 'preview',
      env: {
        NEON_DB_PASSWORD: 'secret-value',
        NEON_DB_URL: 'postgres://example',
      },
    });
    expect(error).toBeNull();
  });

  it('requires environment-specific variables in their target environment', () => {
    const error = validateExperimentalEnvironmentVariables(baseConfig, {
      environment: 'production',
      env: {
        NEON_DB_PASSWORD: 'secret-value',
        NEON_DB_URL: 'postgres://example',
      },
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('`STRIPE_SK`');
    expect(error!.message).toContain('production');
  });

  it('errors when a secret has a plaintext value in vercel.json env', () => {
    const error = validateExperimentalEnvironmentVariables(
      {
        ...baseConfig,
        env: {
          NEON_DB_PASSWORD: 'do-not-commit-me',
          NEON_DB_URL: 'postgres://example',
        },
      },
      {
        environment: 'development',
        env: {
          NEON_DB_PASSWORD: 'do-not-commit-me',
          NEON_DB_URL: 'postgres://example',
        },
      }
    );
    expect(error).not.toBeNull();
    expect(error!.message).toContain('marked as a secret');
    expect(error!.message).toContain('`env`');
    expect(error!.message).toContain('vercel env add');
  });

  it('allows secret references in vercel.json env', () => {
    const error = validateExperimentalEnvironmentVariables(
      {
        ...baseConfig,
        env: {
          NEON_DB_PASSWORD: '@neon-db-password',
          NEON_DB_URL: 'postgres://example',
        },
      },
      {
        environment: 'preview',
        env: {
          NEON_DB_PASSWORD: 'secret-value',
          NEON_DB_URL: 'postgres://example',
        },
      }
    );
    expect(error).toBeNull();
  });

  it('treats empty values as missing', () => {
    const error = validateExperimentalEnvironmentVariables(baseConfig, {
      environment: 'preview',
      env: {
        NEON_DB_PASSWORD: 'secret-value',
        NEON_DB_URL: '',
      },
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('`NEON_DB_URL`');
  });
});
