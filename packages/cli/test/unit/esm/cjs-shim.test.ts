import { createRequire } from 'node:module';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * These tests validate the CJS shim pattern used in the ESM build.
 *
 * The build process injects a banner that creates CommonJS-style globals
 * (`require`, `__filename`, `__dirname`) for ESM compatibility. These tests
 * ensure the pattern works correctly.
 *
 * Banner from scripts/build.mjs:
 * ```
 * import { createRequire as __createRequire } from 'node:module';
 * import { fileURLToPath as __fileURLToPath } from 'node:url';
 * import { dirname as __dirname_ } from 'node:path';
 * const require = __createRequire(import.meta.url);
 * const __filename = __fileURLToPath(import.meta.url);
 * const __dirname = __dirname_(__filename);
 * ```
 */
describe('CJS Shim Globals', () => {
  // Recreate the shim pattern used in the build
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const require = createRequire(import.meta.url);

  describe('__filename', () => {
    it('should be an absolute path', () => {
      expect(isAbsolute(__filename)).toBe(true);
    });

    it('should not include file:// protocol', () => {
      expect(__filename).not.toContain('file://');
    });

    it('should end with the current file name', () => {
      expect(__filename).toMatch(/cjs-shim\.test\.ts$/);
    });

    it('should be a string', () => {
      expect(typeof __filename).toBe('string');
    });
  });

  describe('__dirname', () => {
    it('should be an absolute path', () => {
      expect(isAbsolute(__dirname)).toBe(true);
    });

    it('should not include file:// protocol', () => {
      expect(__dirname).not.toContain('file://');
    });

    it('should match dirname of __filename', () => {
      expect(__dirname).toBe(dirname(__filename));
    });

    it('should end with the esm directory', () => {
      expect(__dirname).toMatch(/esm$/);
    });
  });

  describe('require', () => {
    it('should be a function', () => {
      expect(typeof require).toBe('function');
    });

    it('should require built-in node modules', () => {
      const fs = require('node:fs');
      expect(fs.existsSync).toBeDefined();
      expect(typeof fs.existsSync).toBe('function');
    });

    it('should require JSON files', () => {
      const pkg = require('../../../package.json');
      expect(pkg.name).toBe('vercel');
      expect(pkg.type).toBe('module');
    });

    it('should support require.resolve()', () => {
      const resolved = require.resolve('node:fs');
      expect(resolved).toBe('node:fs');
    });

    it('should support require.resolve() for packages', () => {
      // Resolve a package that exists in the CLI dependencies
      const resolved = require.resolve('vitest');
      expect(resolved).toBeDefined();
      expect(typeof resolved).toBe('string');
    });

    it('should throw for non-existent modules', () => {
      expect(() => {
        require('non-existent-module-that-does-not-exist-12345');
      }).toThrow();
    });
  });

  describe('import.meta.url', () => {
    it('should be a file:// URL', () => {
      expect(import.meta.url).toMatch(/^file:\/\//);
    });

    it('should end with the current file name', () => {
      expect(import.meta.url).toMatch(/cjs-shim\.test\.ts$/);
    });

    it('should be convertible to a path via fileURLToPath', () => {
      const path = fileURLToPath(import.meta.url);
      expect(path).not.toContain('file://');
      expect(isAbsolute(path)).toBe(true);
    });
  });
});
