import { getPathOverrideForPackageManager } from '../src/fs/run-user-scripts';

describe('Test `getPathOverrideForPackageManager()`', () => {
  // TODO: add test for `corepackPackageManager` branch
  // TODO: add test for `lockfileVersion` branch
  // TODO: add test for `validateCorepackPackageManager` true branch

  describe('using corepack', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn');
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    test('should warn if corepack is enabled, pnpm 9 is set, and invalid lockfile version is used', () => {
      getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 5.0,
        corepackPackageManager: 'pnpm@9.*',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Detected lockfile "5" which is not compatible with the intended corepack package manager "pnpm@9.*". Update your lockfile or change to a compatible corepack version.'
        )
      );
    });

    test('should warn if corepack is enabled, pnpm 8 is set, and invalid lockfile version is used', () => {
      getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 5.1,
        corepackPackageManager: 'pnpm@8.*',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Detected lockfile "5.1" which is not compatible with the intended corepack package manager "pnpm@8.*". Update your lockfile or change to a compatible corepack version.'
        )
      );
    });

    test('should warn if corepack package manager does not match cliType', () => {
      getPathOverrideForPackageManager({
        cliType: 'npm',
        lockfileVersion: 9.0,
        corepackPackageManager: 'pnpm@9.*',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Detected package manager "npm" does not match intended corepack defined package manager "pnpm". Change your lockfile or "package.json#packageManager" value to match.'
        )
      );
    });

    test('should warn if corepack package manager has invalid semver version', () => {
      getPathOverrideForPackageManager({
        cliType: 'pnpm',
        lockfileVersion: 9.0,
        corepackPackageManager: 'pnpm@invalid',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Intended corepack defined package manager "pnpm@invalid" is not a valid semver value.'
        )
      );
    });
  });
});
