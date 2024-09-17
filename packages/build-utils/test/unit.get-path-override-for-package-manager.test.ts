import { getPathOverrideForPackageManager } from '../src/fs/run-user-scripts';

describe('Test `getPathOverrideForPackageManager()`', () => {
  describe('with no corepack package manger', () => {
    test('should return detected package manager', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: undefined,
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(result).toStrictEqual({
        detectedLockfile: 'pnpm-lock.yaml',
        detectedPackageManager: 'pnpm@9.x',
        path: '/pnpm9/node_modules/.bin',
        pnpmVersionRange: '9.x',
      });
    });
  });

  describe('with no lockfile version', () => {
    test('should return no override', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: undefined,
        corepackPackageManager: 'pnpm@9.5.0',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(result).toStrictEqual({
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
      });
    });
  });

  describe('without corepack enabled', () => {
    test('should return detected package manager', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: 'pnpm@9.5.0',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        corepackEnabled: false,
      });
      expect(result).toStrictEqual({
        detectedLockfile: 'pnpm-lock.yaml',
        detectedPackageManager: 'pnpm@9.x',
        path: '/pnpm9/node_modules/.bin',
        pnpmVersionRange: '9.x',
      });
    });
  });

  describe('with valid corepack package manager', () => {
    test('should return no override', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: 'pnpm@9.5.0',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(result).toStrictEqual({
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
      });
    });
  });

  describe('with package.json#engines.pnpm', () => {
    describe('with corepack enabled', () => {
      test('should try detected package manager if no corepackPackageManager', () => {
        expect(() => {
          getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 6.1,
            corepackPackageManager: undefined,
            nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
            packageJsonEngines: { pnpm: '>=9.0.0' },
          });
        }).toThrow(
          'Detected pnpm "8.x" is not compatible with the engines.pnpm ">=9.0.0" in your package.json. Either enable corepack with a valid package.json#packageManager value (https://vercel.com/docs/deployments/configure-a-build#corepack) or remove your package.json#engines.pnpm.'
        );
      });

      test('should error if outside engine range', () => {
        expect(() => {
          getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 6.1,
            corepackPackageManager: 'pnpm@8.15.9',
            nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
            packageJsonEngines: { pnpm: '>=9.0.0' },
          });
        }).toThrow(
          `The version of pnpm specified in package.json#packageManager (8.15.9) must satisfy the version range in package.json#engines.pnpm (>=9.0.0).`
        );
      });

      test('should not error if inside engine range', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@9.5.0',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          packageJsonEngines: { pnpm: '>=9.0.0' },
        });
        expect(result).toStrictEqual({
          detectedLockfile: undefined,
          detectedPackageManager: undefined,
          path: undefined,
        });
      });
    });

    describe('with corepack disabled', () => {
      test('should error if detected package manager is outside engine range', () => {
        expect(() => {
          getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 6.1,
            nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
            corepackEnabled: false,
            packageJsonEngines: { pnpm: '>=9.0.0' },
            corepackPackageManager: undefined,
          });
        }).toThrow(
          'Detected pnpm "8.x" is not compatible with the engines.pnpm ">=9.0.0" in your package.json. Either enable corepack with a valid package.json#packageManager value (https://vercel.com/docs/deployments/configure-a-build#corepack) or remove your package.json#engines.pnpm.'
        );
      });

      test('should warn if detected package manager intersects the engine range', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn');
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          corepackEnabled: false,
          packageJsonEngines: { pnpm: '>=9.0.0' },
          corepackPackageManager: undefined,
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Using package.json#engines.pnpm without corepack and package.json#packageManager could lead to failed builds with ERR_PNPM_UNSUPPORTED_ENGINE. Learn more: https://vercel.com/docs/errors/error-list#pnpm-engine-unsupported'
        );
        consoleWarnSpy.mockRestore();
      });

      test('should warn if no detected package manager', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn');
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
          corepackEnabled: false,
          packageJsonEngines: { pnpm: '>=9.0.0' },
          corepackPackageManager: undefined,
        });
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Using package.json#engines.pnpm without corepack and package.json#packageManager could lead to failed builds with ERR_PNPM_UNSUPPORTED_ENGINE. Learn more: https://vercel.com/docs/errors/error-list#pnpm-engine-unsupported'
        );
        consoleWarnSpy.mockRestore();
      });
    });
  });

  describe('using corepack', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn');
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    test('should throw if corepack is enabled, pnpm 9 is set, and invalid lockfile version is used', () => {
      expect(() => {
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 5.0,
          corepackPackageManager: 'pnpm@9.5.0',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        });
      }).toThrow(
        'Detected lockfile "5" which is not compatible with the intended corepack package manager "pnpm@9.5.0". Update your lockfile or change to a compatible corepack version.'
      );
    });

    test('should throw if corepack is enabled, pnpm 8 is set, and invalid lockfile version is used', () => {
      expect(() =>
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 5.1,
          corepackPackageManager: 'pnpm@8.15.9',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        })
      ).toThrow(
        'Detected lockfile "5.1" which is not compatible with the intended corepack package manager "pnpm@8.15.9". Update your lockfile or change to a compatible corepack version.'
      );
    });

    test('should throw if corepack package manager does not match cliType', () => {
      expect(() =>
        getPathOverrideForPackageManager({
          cliType: 'npm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@9.5.0',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        })
      ).toThrow(
        'Detected package manager "npm" does not match intended corepack defined package manager "pnpm". Change your lockfile or "package.json#packageManager" value to match.'
      );
    });

    test('should throw if corepack package manager has invalid semver version', () => {
      expect(() =>
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@invalid',
          nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        })
      ).toThrow(
        'Intended corepack defined package manager "pnpm@invalid" is not a valid semver value.'
      );
    });
  });
});
