import { describe, test, expect } from 'vitest';
import {
  detectPackageManager,
  PNPM_10_PREFERRED_AT,
} from '../src/fs/run-user-scripts';

describe('Test `detectPackageManager()`', () => {
  describe('with "npm"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof detectPackageManager>;
      want: unknown;
    }>([
      {
        name: 'returns undefined for `npm` (because it is default)',
        args: ['npm', 1],
        want: undefined,
      },
    ])('$name', ({ args, want }) => {
      const [cliType, lockfileVersion] = args;
      expect(detectPackageManager(cliType, lockfileVersion)).toStrictEqual(
        want
      );
    });
  });

  describe('with "pnpm', () => {
    test.each<{
      name: string;
      args: Parameters<typeof detectPackageManager>;
      want: unknown;
    }>([
      {
        name: 'for 5.3 lockfile returns pnpm 6 path',
        args: ['pnpm', 5.3],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@6.x',
          pnpmVersionRange: '6.x',
          path: undefined,
        },
      },
      {
        name: 'for 5.4 lockfile returns pnpm 7 path',
        args: ['pnpm', 5.4],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@7.x',
          pnpmVersionRange: '7.x',
          path: '/pnpm7/node_modules/.bin',
        },
      },
      {
        name: 'for 6.0 lockfile returns pnpm 8 path',
        args: ['pnpm', 6.0],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@8.x',
          pnpmVersionRange: '8.x',
          path: '/pnpm8/node_modules/.bin',
        },
      },
      {
        name: 'for 6.1 lockfile returns pnpm 8 path',
        args: ['pnpm', 6.1],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@8.x',
          pnpmVersionRange: '8.x',
          path: '/pnpm8/node_modules/.bin',
        },
      },
      {
        name: 'for 7.0 lockfile returns pnpm 9 path',
        args: ['pnpm', 7.0],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          pnpmVersionRange: '9.x',
          path: '/pnpm9/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 9 path with no project created time',
        args: ['pnpm', 9.0],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          pnpmVersionRange: '9.x',
          path: '/pnpm9/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 9 path before prefer pnpm 10 datetime',
        args: ['pnpm', 9.0, PNPM_10_PREFERRED_AT.getTime() - 1000],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          pnpmVersionRange: '9.x',
          path: '/pnpm9/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 10 path after prefer pnpm 10 datetime',
        args: ['pnpm', 9.0, PNPM_10_PREFERRED_AT.getTime() + 1000],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          pnpmVersionRange: '10.x',
          path: '/pnpm10/node_modules/.bin',
        },
      },
      {
        name: 'for undefined lockfile does not return a path',
        args: ['pnpm', -3],
        want: undefined,
      },
      {
        name: 'for undefined lockfile does not return a path',
        args: ['pnpm', undefined],
        want: undefined,
      },
    ])('$name', ({ args, want }) => {
      const [cliType, lockfileVersion, preferredAt] = args;
      expect(
        detectPackageManager(cliType, lockfileVersion, preferredAt)
      ).toStrictEqual(want);
    });
  });

  describe('with "yarn"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof detectPackageManager>;
      want: unknown;
    }>([
      {
        name: 'yarn@1.x does not return a path',
        args: ['yarn', 1],
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn@1.x',
        },
      },
      {
        name: 'yarn@2.x does not return a path',
        args: ['yarn', 4],
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn@2.x',
        },
      },
      {
        name: 'yarn@3.x does not return a path',
        args: ['yarn', 6],
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn@3.x',
        },
      },
      {
        name: 'yarn@4.x does not return a path',
        args: ['yarn', 8],
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn@4.x',
        },
      },
    ])('$name', ({ args, want }) => {
      const [cliType, lockfileVersion] = args;
      expect(detectPackageManager(cliType, lockfileVersion)).toStrictEqual(
        want
      );
    });
  });

  describe('with "bun"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof detectPackageManager>;
      want: unknown;
    }>([
      {
        name: 'returns bun@1 path',
        args: ['bun', 0],
        want: {
          path: '/bun1',
          detectedLockfile: 'bun.lockb',
          detectedPackageManager: 'bun@1.x',
        },
      },
      {
        name: 'returns bun@1 path',
        args: ['bun', 1],
        want: {
          path: '/bun1',
          detectedLockfile: 'bun.lock',
          detectedPackageManager: 'bun@1.x',
        },
      },
    ])('$name', ({ args, want }) => {
      const [cliType, lockfileVersion] = args;
      expect(detectPackageManager(cliType, lockfileVersion)).toStrictEqual(
        want
      );
    });
  });
});
