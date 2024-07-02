import { getPathOverrideForPackageManager } from '../src/fs/run-user-scripts';

describe('Test `getPathOverrideForPackageManager()`', () => {
  // TODO: add test for `corepackPackageManager` branch
  // TODO: add test for `lockfileVersion` branch
  // TODO: add test for `validateCorepackPackageManager` true branch

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
      // TODO: these assertions should change to be that a warning was logged; check some part of the unique message
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
