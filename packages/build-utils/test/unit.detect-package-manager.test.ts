import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectPackageManager,
  PNPM_10_PREFERRED_AT,
  PNPM_11_PREFERRED_AT,
} from '../src/fs/run-user-scripts';
import { getNodeVersionByMajor } from '../src/fs/node-version';
import { mockPnpmMajorAvailable } from './mock-pnpm-major-available';

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
    beforeEach(() => {
      mockPnpmMajorAvailable(11, true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

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
          path: '/pnpm6/node_modules/.bin',
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
        name: 'for 9.0 lockfile returns pnpm 10 path before prefer pnpm 11 datetime',
        args: ['pnpm', 9.0, PNPM_11_PREFERRED_AT.getTime() - 1000],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          pnpmVersionRange: '10.x',
          path: '/pnpm10/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 10 for projects created after the 2026-08-19 rollback cutoff',
        args: ['pnpm', 9.0, new Date('2026-09-02T15:00:00Z').getTime()],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          pnpmVersionRange: '10.x',
          path: '/pnpm10/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 11 path after prefer pnpm 11 datetime',
        args: ['pnpm', 9.0, PNPM_11_PREFERRED_AT.getTime() + 1000],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          pnpmVersionRange: '11.x',
          path: '/pnpm11/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 11 path after prefer pnpm 11 datetime on Node 22',
        args: [
          'pnpm',
          9.0,
          PNPM_11_PREFERRED_AT.getTime() + 1000,
          getNodeVersionByMajor(22),
        ],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          pnpmVersionRange: '11.x',
          path: '/pnpm11/node_modules/.bin',
        },
      },
      {
        name: 'for 9.0 lockfile returns pnpm 10 path after prefer pnpm 11 datetime on Node 20',
        args: [
          'pnpm',
          9.0,
          PNPM_11_PREFERRED_AT.getTime() + 1000,
          getNodeVersionByMajor(20),
        ],
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
      const [cliType, lockfileVersion, preferredAt, nodeVersion] = args;
      expect(
        detectPackageManager(cliType, lockfileVersion, preferredAt, nodeVersion)
      ).toStrictEqual(want);
    });

    test('for 9.0 lockfile returns pnpm 10 when /pnpm11 is not in the image', () => {
      mockPnpmMajorAvailable(11, false);
      expect(
        detectPackageManager(
          'pnpm',
          9.0,
          PNPM_11_PREFERRED_AT.getTime() + 1000,
          getNodeVersionByMajor(22)
        )
      ).toStrictEqual({
        detectedLockfile: 'pnpm-lock.yaml',
        detectedPackageManager: 'pnpm@10.x',
        pnpmVersionRange: '10.x',
        path: '/pnpm10/node_modules/.bin',
      });
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
