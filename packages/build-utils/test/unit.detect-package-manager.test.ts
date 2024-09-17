import { detectPackageManager } from '../src/fs/run-user-scripts';

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
        name: 'for 9.0 lockfile returns pnpm 9 path',
        args: ['pnpm', 9.0],
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          pnpmVersionRange: '9.x',
          path: '/pnpm9/node_modules/.bin',
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
      const [cliType, lockfileVersion] = args;
      expect(detectPackageManager(cliType, lockfileVersion)).toStrictEqual(
        want
      );
    });
  });

  describe('with "yarn"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof detectPackageManager>;
      want: unknown;
    }>([
      {
        name: 'does not return a path',
        args: ['yarn', 1],
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn',
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
        args: ['bun', 1],
        want: {
          path: '/bun1',
          detectedLockfile: 'bun.lockb',
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
