import {
  getPathOverrideForPackageManager,
  PNPM_10_PREFERRED_AT,
  PNPM_11_PREFERRED_AT,
} from '../src/fs/run-user-scripts';
import {
  describe,
  beforeEach,
  test,
  expect,
  vi,
  MockInstance,
  afterEach,
} from 'vitest';
import {
  getNodeVersionByMajor,
  getSupportedBunVersion,
} from '../src/fs/node-version';
import { mockPnpmMajorAvailable } from './mock-pnpm-major-available';

describe('Test `getPathOverrideForPackageManager()`', () => {
  describe('with no corepack package manger', () => {
    test('should return detected package manager', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: undefined,
        nodeVersion: getNodeVersionByMajor(16),
      });
      expect(result).toStrictEqual({
        detectedLockfile: 'pnpm-lock.yaml',
        detectedPackageManager: 'pnpm@9.x',
        path: '/pnpm9/node_modules/.bin',
        pnpmVersionRange: '9.x',
      });
    });

    test.each([
      ['1.x', '/bun1'],
      ['1.4.x', '/bun1.4'],
    ])('should select Bun %s from %s', (range, expectedPath) => {
      const result = getPathOverrideForPackageManager({
        cliType: 'bun',
        lockfileVersion: 1,
        corepackPackageManager: undefined,
        nodeVersion: getSupportedBunVersion(range),
      });

      expect(result).toStrictEqual({
        detectedLockfile: 'bun.lock',
        detectedPackageManager: `bun@${range}`,
        path: expectedPath,
      });
    });
  });

  describe('with no lockfile version', () => {
    test('should return no override', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: undefined,
        corepackPackageManager: 'pnpm@9.5.0',
        nodeVersion: getNodeVersionByMajor(16),
      });
      expect(result).toStrictEqual({
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
      });
    });
  });

  describe('without corepack enabled', () => {
    describe('with `pnpm-lock.yaml` v9', () => {
      beforeEach(() => {
        mockPnpmMajorAvailable(11, true);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      test('should return pnpm@9 for projects created before PNPM_10_PREFERRED_AT', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          nodeVersion: getNodeVersionByMajor(16),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          path: '/pnpm9/node_modules/.bin',
          pnpmVersionRange: '9.x',
        });
      });

      test('should return pnpm@10 for projects created after PNPM_10_PREFERRED_AT', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          nodeVersion: getNodeVersionByMajor(16),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          path: '/pnpm10/node_modules/.bin',
          pnpmVersionRange: '10.x',
        });
      });

      test('should return pnpm@11 for projects created after PNPM_11_PREFERRED_AT', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_11_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should honor compatible packageManager pin instead of created-at default', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@9.5.0',
          nodeVersion: getNodeVersionByMajor(16),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          path: '/pnpm9/node_modules/.bin',
          pnpmVersionRange: '9.x',
        });
      });

      test('should honor packageManager pin with integrity hash', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager:
            'pnpm@11.5.1+sha512.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          nodeVersion: getNodeVersionByMajor(20),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should ignore packageManager pin that is incompatible with the lockfile', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@8.15.9',
          nodeVersion: getNodeVersionByMajor(18),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          path: '/pnpm10/node_modules/.bin',
          pnpmVersionRange: '10.x',
        });
      });

      test('should honor devEngines.packageManager over packageManager', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@9.5.0',
          packageJsonDevEngines: {
            packageManager: { name: 'pnpm', version: '11.5.1' },
          },
          nodeVersion: getNodeVersionByMajor(20),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should honor devEngines.packageManager range', () => {
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          packageJsonDevEngines: {
            packageManager: { name: 'pnpm', version: '>=11.0.0' },
          },
          nodeVersion: getNodeVersionByMajor(20),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should fall back to pnpm 10 when /pnpm11 is not in the image', () => {
        mockPnpmMajorAvailable(11, false);
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_11_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@10.x',
          path: '/pnpm10/node_modules/.bin',
          pnpmVersionRange: '10.x',
        });
      });

      test('should not put /pnpm11 on PATH for a pnpm 11 pin when the binary is missing', () => {
        mockPnpmMajorAvailable(11, false);
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@11.5.1',
          nodeVersion: getNodeVersionByMajor(20),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          path: '/pnpm9/node_modules/.bin',
          pnpmVersionRange: '9.x',
        });
      });

      test('should honor a pnpm 12 packageManager pin when /pnpm12 exists', () => {
        mockPnpmMajorAvailable({ 11: true, 12: true });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@12.0.0',
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_11_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@12.x',
          path: '/pnpm12/node_modules/.bin',
          pnpmVersionRange: '12.x',
        });
      });

      test('should not put /pnpm12 on PATH for a pnpm 12 pin when the binary is missing', () => {
        mockPnpmMajorAvailable({ 11: true, 12: false });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: 'pnpm@12.0.0',
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@9.x',
          path: '/pnpm9/node_modules/.bin',
          pnpmVersionRange: '9.x',
        });
      });

      test('should not auto-adopt pnpm 12 for unpinned lockfile 9.0 when /pnpm12 exists', () => {
        mockPnpmMajorAvailable({ 11: true, 12: true });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_11_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should keep a ^11 pin on pnpm 11 when /pnpm12 exists', () => {
        mockPnpmMajorAvailable({ 11: true, 12: true });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          packageJsonDevEngines: {
            packageManager: { name: 'pnpm', version: '^11.0.0' },
          },
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_11_PREFERRED_AT.getTime() + 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@11.x',
          path: '/pnpm11/node_modules/.bin',
          pnpmVersionRange: '11.x',
        });
      });

      test('should select pnpm 12 for a >=11 range when /pnpm12 exists', () => {
        mockPnpmMajorAvailable({ 11: true, 12: true });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager: undefined,
          packageJsonDevEngines: {
            packageManager: { name: 'pnpm', version: '>=11.0.0' },
          },
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@12.x',
          path: '/pnpm12/node_modules/.bin',
          pnpmVersionRange: '12.x',
        });
      });

      test('should honor a pnpm 12 pin with integrity hash', () => {
        mockPnpmMajorAvailable({ 11: true, 12: true });
        const result = getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          corepackPackageManager:
            'pnpm@12.0.0+sha512.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          nodeVersion: getNodeVersionByMajor(22),
          corepackEnabled: false,
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
        });
        expect(result).toStrictEqual({
          detectedLockfile: 'pnpm-lock.yaml',
          detectedPackageManager: 'pnpm@12.x',
          path: '/pnpm12/node_modules/.bin',
          pnpmVersionRange: '12.x',
        });
      });
    });
  });

  describe('with valid corepack package manager', () => {
    test('should return no override', () => {
      const result = getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: 'pnpm@9.5.0',
        nodeVersion: getNodeVersionByMajor(16),
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
            nodeVersion: getNodeVersionByMajor(16),
            packageJsonEngines: { pnpm: '>=9.0.0' },
          });
        }).toThrow(
          'Detected pnpm "8.x" is not compatible with the engines.pnpm ">=9.0.0" in your package.json. Set package.json#packageManager or package.json#devEngines.packageManager to a compatible pnpm version, or remove package.json#engines.pnpm.'
        );
      });

      test('should error if outside engine range', () => {
        expect(() => {
          getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 6.1,
            corepackPackageManager: 'pnpm@8.15.9',
            nodeVersion: getNodeVersionByMajor(16),
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
          nodeVersion: getNodeVersionByMajor(16),
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
            nodeVersion: getNodeVersionByMajor(16),
            corepackEnabled: false,
            packageJsonEngines: { pnpm: '>=9.0.0' },
            corepackPackageManager: undefined,
          });
        }).toThrow(
          'Detected pnpm "8.x" is not compatible with the engines.pnpm ">=9.0.0" in your package.json. Set package.json#packageManager or package.json#devEngines.packageManager to a compatible pnpm version, or remove package.json#engines.pnpm.'
        );
      });

      describe('with detected pnpm 10', () => {
        beforeEach(() => {
          mockPnpmMajorAvailable(11, true);
        });

        afterEach(() => {
          vi.restoreAllMocks();
        });

        test('should select pnpm 9 when engines.pnpm is 9.x', () => {
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(20),
            corepackEnabled: false,
            corepackPackageManager: undefined,
            packageJsonEngines: { pnpm: '9.x' },
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@9.x',
            path: '/pnpm9/node_modules/.bin',
            pnpmVersionRange: '9.x',
          });
        });

        test('should honor package.json#packageManager over the created-at default', () => {
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(20),
            corepackEnabled: false,
            packageJsonEngines: { pnpm: '9.x' },
            corepackPackageManager: 'pnpm@9.5.0',
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@9.x',
            path: '/pnpm9/node_modules/.bin',
            pnpmVersionRange: '9.x',
          });
        });

        test('should select pnpm 11 when engines.pnpm is 11.x on an older project', () => {
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(20),
            corepackEnabled: false,
            corepackPackageManager: undefined,
            packageJsonEngines: { pnpm: '11.x' },
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@11.x',
            path: '/pnpm11/node_modules/.bin',
            pnpmVersionRange: '11.x',
          });
        });

        test('should not throw when engines.pnpm is 11.x but /pnpm11 is missing', () => {
          mockPnpmMajorAvailable(11, false);
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(20),
            corepackEnabled: false,
            corepackPackageManager: undefined,
            packageJsonEngines: { pnpm: '11.x' },
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@9.x',
            path: '/pnpm9/node_modules/.bin',
            pnpmVersionRange: '9.x',
          });
        });

        test('should select pnpm 12 when engines.pnpm is 12.x and /pnpm12 exists', () => {
          mockPnpmMajorAvailable({ 11: true, 12: true });
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(22),
            corepackEnabled: false,
            corepackPackageManager: undefined,
            packageJsonEngines: { pnpm: '12.x' },
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@12.x',
            path: '/pnpm12/node_modules/.bin',
            pnpmVersionRange: '12.x',
          });
        });

        test('should not throw when engines.pnpm is 12.x but /pnpm12 is missing', () => {
          mockPnpmMajorAvailable({ 11: true, 12: false });
          const result = getPathOverrideForPackageManager({
            cliType: 'pnpm',
            lockfileVersion: 9.0,
            nodeVersion: getNodeVersionByMajor(22),
            corepackEnabled: false,
            corepackPackageManager: undefined,
            packageJsonEngines: { pnpm: '12.x' },
            projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() - 1000,
          });
          expect(result).toStrictEqual({
            detectedLockfile: 'pnpm-lock.yaml',
            detectedPackageManager: 'pnpm@9.x',
            path: '/pnpm9/node_modules/.bin',
            pnpmVersionRange: '9.x',
          });
        });
      });
      test('should warn if detected package manager intersects the engine range', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn');
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          nodeVersion: getNodeVersionByMajor(16),
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
        const consoleWarnSpy = vi.spyOn(console, 'warn');
        getPathOverrideForPackageManager({
          cliType: 'pnpm',
          lockfileVersion: 9.0,
          nodeVersion: getNodeVersionByMajor(16),
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
    let consoleWarnSpy: MockInstance<typeof console.warn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn');
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
          nodeVersion: getNodeVersionByMajor(16),
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
          nodeVersion: getNodeVersionByMajor(16),
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
          nodeVersion: getNodeVersionByMajor(16),
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
          nodeVersion: getNodeVersionByMajor(16),
        })
      ).toThrow(
        'Intended corepack defined package manager "pnpm@invalid" is not a valid semver value.'
      );
    });
  });
});
