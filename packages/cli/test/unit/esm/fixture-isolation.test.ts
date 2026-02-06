import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * These tests validate that test fixtures are properly isolated from the
 * ESM parent package.
 *
 * When packages/cli/package.json has "type": "module", Node.js treats all
 * .js files in the package as ESM by default. This inheritance follows the
 * package.json lookup chain up the directory tree.
 *
 * Test fixtures use CommonJS syntax (require, module.exports) and must have
 * their own package.json with "type": "commonjs" to prevent ESM parsing errors
 * like "require is not defined in ES module scope".
 *
 * Fixture directories with "type": "commonjs":
 * - packages/cli/test/fixtures/package.json
 * - packages/cli/test/dev/fixtures/package.json
 */
describe('Test Fixture Module Type Isolation', () => {
  describe('CLI package ESM configuration', () => {
    it('packages/cli/package.json should have type: module', () => {
      const pkgPath = join(__dirname, '../../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.type).toBe('module');
    });
  });

  describe('test/fixtures isolation', () => {
    it('test/fixtures/package.json should exist', () => {
      const pkgPath = join(__dirname, '../../fixtures/package.json');
      expect(existsSync(pkgPath)).toBe(true);
    });

    it('test/fixtures/package.json should have type: commonjs', () => {
      const pkgPath = join(__dirname, '../../fixtures/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.type).toBe('commonjs');
    });

    it('test/fixtures/package.json should be private', () => {
      const pkgPath = join(__dirname, '../../fixtures/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.private).toBe(true);
    });
  });

  describe('test/dev/fixtures isolation', () => {
    it('test/dev/fixtures/package.json should exist', () => {
      const pkgPath = join(__dirname, '../../dev/fixtures/package.json');
      expect(existsSync(pkgPath)).toBe(true);
    });

    it('test/dev/fixtures/package.json should have type: commonjs', () => {
      const pkgPath = join(__dirname, '../../dev/fixtures/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.type).toBe('commonjs');
    });

    it('test/dev/fixtures/package.json should be private', () => {
      const pkgPath = join(__dirname, '../../dev/fixtures/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.private).toBe(true);
    });
  });

  describe('module type inheritance prevention', () => {
    it('fixture package.json should prevent ESM inheritance', () => {
      // The "type" field in package.json determines how Node.js treats .js files
      // Without explicit "type": "commonjs", fixtures would inherit "type": "module"
      // from packages/cli/package.json

      const cliPkgPath = join(__dirname, '../../../package.json');
      const fixturesPkgPath = join(__dirname, '../../fixtures/package.json');

      const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf-8'));
      const fixturesPkg = JSON.parse(readFileSync(fixturesPkgPath, 'utf-8'));

      // CLI is ESM
      expect(cliPkg.type).toBe('module');
      // Fixtures explicitly override to CommonJS
      expect(fixturesPkg.type).toBe('commonjs');
      // They should be different (isolation is working)
      expect(cliPkg.type).not.toBe(fixturesPkg.type);
    });

    it('dev fixture package.json should prevent ESM inheritance', () => {
      const cliPkgPath = join(__dirname, '../../../package.json');
      const devFixturesPkgPath = join(
        __dirname,
        '../../dev/fixtures/package.json'
      );

      const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf-8'));
      const devFixturesPkg = JSON.parse(
        readFileSync(devFixturesPkgPath, 'utf-8')
      );

      // CLI is ESM
      expect(cliPkg.type).toBe('module');
      // Dev fixtures explicitly override to CommonJS
      expect(devFixturesPkg.type).toBe('commonjs');
      // They should be different (isolation is working)
      expect(cliPkg.type).not.toBe(devFixturesPkg.type);
    });
  });
});
