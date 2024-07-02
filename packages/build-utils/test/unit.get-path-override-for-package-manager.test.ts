import { getEnvForPackageManager } from '../src';
import { getPathOverrideForPackageManager } from '../src/fs/run-user-scripts';

describe('Test `getPathOverrideForPackageManager()`', () => {
  describe('with "npm"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
    }>([
      {
        // TODO: either delete or remove conditions of using old node version
        name: 'should do nothing to env for npm < 6 and node < 16',
        args: {
          cliType: 'npm',
          nodeVersion: { major: 14, range: '14.x', runtime: 'nodejs14.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 1,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should not set npm path if corepack enabled',
        args: {
          cliType: 'npm',
          nodeVersion: { major: 14, range: '14.x', runtime: 'nodejs14.x' },
          packageJsonPackageManager: 'npm@*',
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            ENABLE_EXPERIMENTAL_COREPACK: '1',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should not set path if node is 16 and npm 7+ is detected',
        args: {
          cliType: 'npm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
    ])('$name', ({ args, want }) => {
      expect(
        getPathOverrideForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          corepackPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
        })
      ).toStrictEqual(want);
    });
  });

  describe('with "pnpm', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
    }>([
      {
        name: 'should not set path if pnpm 6 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 5.3, // detects as pnpm@6, which is the default
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm 6',
          path: undefined,
        },
      },
      {
        name: 'should set path if pnpm 7+ is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@7.x',
          path: '/pnpm7/node_modules/.bin',
        },
      },
      {
        name: 'should set path if pnpm 8 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 6.1,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@8.x',
          path: '/pnpm8/node_modules/.bin',
        },
      },
      {
        name: 'should set path if pnpm 9 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 7.0,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          path: '/pnpm9/node_modules/.bin',
        },
      },
      {
        name: 'should not set pnpm path if corepack is enabled',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: 'pnpm@*',
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
            ENABLE_EXPERIMENTAL_COREPACK: '1',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should not set pnpm path if corepack is enabled, pnpm 9 and valid lockfile version',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
          packageJsonPackageManager: 'pnpm@9.*',
          lockfileVersion: 7.0,
          env: {
            FOO: 'bar',
            ENABLE_EXPERIMENTAL_COREPACK: '1',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should allow lockfile 5.3 with pnpm 6.x',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: 'pnpm@6.x',
          lockfileVersion: 5.3,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should allow lockfile 5.3 with pnpm 7.x',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: 'pnpm@7.x',
          lockfileVersion: 5.3,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should allow lockfile 5.4 with pnpm 6.x',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: 'pnpm@6.x',
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
      {
        name: 'should allow lockfile 5.4 with pnpm 7.x',
        args: {
          cliType: 'pnpm',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonPackageManager: 'pnpm@7.x',
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        },
      },
    ])('$name', ({ args, want }) => {
      expect(
        getPathOverrideForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          corepackPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
        })
      ).toStrictEqual(want);
    });

    test('should throw error with pnpm 9.0.0 on lockfile version 6.0', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 6.0,
          corepackPackageManager: 'pnpm@9.0.0',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow();
    });
  });

  describe('with "yarn"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
    }>([
      {
        name: 'should not set path if yarn detected',
        args: {
          cliType: 'yarn',
          nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 1,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          path: undefined,
          detectedLockfile: 'yarn.lock',
          detectedPackageManager: 'yarn',
        },
      },
    ])('$name', ({ args, want }) => {
      expect(
        getPathOverrideForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          corepackPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
        })
      ).toStrictEqual(want);
    });
  });

  describe('with "bun"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
    }>([
      {
        name: 'should set path if bun detected',
        args: {
          cliType: 'bun',
          nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
          packageJsonPackageManager: undefined,
          lockfileVersion: 1,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          path: '/bun1',
          detectedLockfile: 'bun.lockb',
          detectedPackageManager: 'bun@1.x',
        },
      },
    ])('$name', ({ args, want }) => {
      expect(
        getPathOverrideForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          corepackPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
        })
      ).toStrictEqual(want);
    });
  });

  describe('using corepack', () => {
    test('should throw error if corepack is enabled, pnpm 9 is set, and invalid lockfile version is used', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 5.0,
          corepackPackageManager: 'pnpm@9.*',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow();
    });
    test('should throw error if corepack is enabled, pnpm 8 is set, and invalid lockfile version is used', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 5.1,
          corepackPackageManager: 'pnpm@8.*',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow();
    });
    test('should throw error if corepack package manager does not match cliType', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'npm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@9.*',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow();
    });
    test('should throw error if corepack package manager has invalid semver version', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@invalid',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow();
    });
  });
});
