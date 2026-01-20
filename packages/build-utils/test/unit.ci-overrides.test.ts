import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  getOverriddenScanParentDirsResult,
  getOverriddenNodeVersion,
} from '../src/fs/run-user-scripts';

describe('Test CI Override Functions', () => {
  // Store original env vars to restore after each test
  const originalEnv: Record<string, string | undefined> = {};
  const envVarsToClean = [
    'VERCEL_CI_CLI_TYPE',
    'VERCEL_CI_LOCKFILE_VERSION',
    'VERCEL_CI_PACKAGE_MANAGER',
    'VERCEL_CI_TURBO_SUPPORTS_COREPACK',
    'VERCEL_CI_NODE_VERSION',
  ];

  beforeEach(() => {
    // Save original values
    for (const key of envVarsToClean) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of envVarsToClean) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  describe('getOverriddenScanParentDirsResult()', () => {
    test('returns undefined when VERCEL_CI_CLI_TYPE is not set', () => {
      delete process.env.VERCEL_CI_CLI_TYPE;
      expect(getOverriddenScanParentDirsResult()).toBeUndefined();
    });

    test('returns undefined for invalid cliType', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'invalid';
      expect(getOverriddenScanParentDirsResult()).toBeUndefined();
    });

    test.each(['npm', 'yarn', 'pnpm', 'bun', 'vlt'] as const)(
      'returns result with cliType=%s',
      cliType => {
        process.env.VERCEL_CI_CLI_TYPE = cliType;
        const result = getOverriddenScanParentDirsResult();
        expect(result).toBeDefined();
        expect(result?.cliType).toBe(cliType);
        expect(result?.packageJsonPath).toBeUndefined();
        expect(result?.packageJson).toBeUndefined();
        expect(result?.lockfilePath).toBeUndefined();
      }
    );

    test('parses lockfileVersion correctly', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_LOCKFILE_VERSION = '9';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.lockfileVersion).toBe(9);
    });

    test('handles lockfileVersion of 0 correctly', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'bun';
      process.env.VERCEL_CI_LOCKFILE_VERSION = '0';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.lockfileVersion).toBe(0);
    });

    test('handles decimal lockfileVersion correctly', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_LOCKFILE_VERSION = '5.4';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.lockfileVersion).toBe(5.4);
    });

    test('includes packageJsonPackageManager when set', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_PACKAGE_MANAGER = 'pnpm@9.0.0';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.packageJsonPackageManager).toBe('pnpm@9.0.0');
    });

    test('sets turboSupportsCorepackHome to true when VERCEL_CI_TURBO_SUPPORTS_COREPACK is "1"', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_TURBO_SUPPORTS_COREPACK = '1';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.turboSupportsCorepackHome).toBe(true);
    });

    test('sets turboSupportsCorepackHome to false when VERCEL_CI_TURBO_SUPPORTS_COREPACK is "0"', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_TURBO_SUPPORTS_COREPACK = '0';
      const result = getOverriddenScanParentDirsResult();
      expect(result?.turboSupportsCorepackHome).toBe(false);
    });

    test('sets turboSupportsCorepackHome to undefined when VERCEL_CI_TURBO_SUPPORTS_COREPACK is not set', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      delete process.env.VERCEL_CI_TURBO_SUPPORTS_COREPACK;
      const result = getOverriddenScanParentDirsResult();
      expect(result?.turboSupportsCorepackHome).toBeUndefined();
    });

    test('returns complete result with all env vars set', () => {
      process.env.VERCEL_CI_CLI_TYPE = 'pnpm';
      process.env.VERCEL_CI_LOCKFILE_VERSION = '9';
      process.env.VERCEL_CI_PACKAGE_MANAGER = 'pnpm@9.5.0';
      process.env.VERCEL_CI_TURBO_SUPPORTS_COREPACK = '1';

      const result = getOverriddenScanParentDirsResult();
      expect(result).toEqual({
        cliType: 'pnpm',
        lockfileVersion: 9,
        packageJsonPackageManager: 'pnpm@9.5.0',
        turboSupportsCorepackHome: true,
        packageJsonPath: undefined,
        packageJson: undefined,
        lockfilePath: undefined,
      });
    });
  });

  describe('getOverriddenNodeVersion()', () => {
    test('returns undefined when VERCEL_CI_NODE_VERSION is not set', () => {
      delete process.env.VERCEL_CI_NODE_VERSION;
      expect(getOverriddenNodeVersion()).toBeUndefined();
    });

    test('returns undefined for invalid (non-numeric) value', () => {
      process.env.VERCEL_CI_NODE_VERSION = 'invalid';
      expect(getOverriddenNodeVersion()).toBeUndefined();
    });

    test('returns undefined for empty string', () => {
      process.env.VERCEL_CI_NODE_VERSION = '';
      expect(getOverriddenNodeVersion()).toBeUndefined();
    });

    test.each([18, 20, 22, 24])('returns NodeVersion for major=%d', major => {
      process.env.VERCEL_CI_NODE_VERSION = String(major);
      const result = getOverriddenNodeVersion();
      expect(result).toBeDefined();
      expect(result?.major).toBe(major);
      expect(result?.range).toBe(`${major}.x`);
      expect(result?.runtime).toBe(`nodejs${major}.x`);
    });

    test('constructs NodeVersion for unknown major version', () => {
      process.env.VERCEL_CI_NODE_VERSION = '99';
      const result = getOverriddenNodeVersion();
      expect(result).toBeDefined();
      expect(result?.major).toBe(99);
      expect(result?.range).toBe('99.x');
      expect(result?.runtime).toBe('nodejs99.x');
    });

    test('handles version "0" correctly (edge case)', () => {
      process.env.VERCEL_CI_NODE_VERSION = '0';
      const result = getOverriddenNodeVersion();
      // Version 0 is not in the known list, so it should construct one
      expect(result).toBeDefined();
      expect(result?.major).toBe(0);
      expect(result?.range).toBe('0.x');
    });
  });
});
