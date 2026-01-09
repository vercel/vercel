import { describe, expect, it } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';

/**
 * These tests validate file:// URL handling for ESM compatibility.
 *
 * In ESM, stack traces and import.meta.url use file:// URLs instead of
 * regular file paths. The get-package-json internal package was updated
 * to handle this:
 *
 * From internals/get-package-json/src/index.ts:
 * ```
 * if (filePath.startsWith('file://')) {
 *   filePath = fileURLToPath(filePath);
 * }
 * ```
 */
describe('file:// URL Handling', () => {
  describe('fileURLToPath conversion', () => {
    it('should convert file:// URLs to regular paths', () => {
      const fileUrl = 'file:///Users/test/project/index.js';
      const filePath = fileURLToPath(fileUrl);

      expect(filePath).toBe('/Users/test/project/index.js');
      expect(filePath).not.toContain('file://');
    });

    it('should handle paths with spaces (encoded as %20)', () => {
      const fileUrl = 'file:///Users/test/my%20project/index.js';
      const filePath = fileURLToPath(fileUrl);

      expect(filePath).toBe('/Users/test/my project/index.js');
    });

    it('should handle paths with special characters', () => {
      const fileUrl = 'file:///Users/test/project%40v2/index.js';
      const filePath = fileURLToPath(fileUrl);

      expect(filePath).toBe('/Users/test/project@v2/index.js');
    });

    it('should produce absolute paths', () => {
      const fileUrl = 'file:///some/absolute/path/file.js';
      const filePath = fileURLToPath(fileUrl);

      expect(isAbsolute(filePath)).toBe(true);
    });
  });

  describe('file:// prefix detection', () => {
    it('should detect file:// prefix in ESM URLs', () => {
      const esmPath = 'file:///path/to/module.js';
      const cjsPath = '/path/to/module.js';

      expect(esmPath.startsWith('file://')).toBe(true);
      expect(cjsPath.startsWith('file://')).toBe(false);
    });

    it('should handle edge cases in startsWith check', () => {
      expect('file://'.startsWith('file://')).toBe(true);
      expect('file:///'.startsWith('file://')).toBe(true);
      expect('FILE://'.startsWith('file://')).toBe(false); // case sensitive
      expect('/file://path'.startsWith('file://')).toBe(false);
    });
  });

  describe('pathToFileURL conversion', () => {
    it('should convert regular paths to file:// URLs', () => {
      const filePath = '/Users/test/project/index.js';
      const fileUrl = pathToFileURL(filePath);

      expect(fileUrl.href).toBe('file:///Users/test/project/index.js');
      expect(fileUrl.protocol).toBe('file:');
    });

    it('should encode spaces in paths', () => {
      const filePath = '/Users/test/my project/index.js';
      const fileUrl = pathToFileURL(filePath);

      expect(fileUrl.href).toBe('file:///Users/test/my%20project/index.js');
    });

    it('should be reversible with fileURLToPath', () => {
      const originalPath = '/Users/test/project/index.js';
      const fileUrl = pathToFileURL(originalPath);
      const convertedBack = fileURLToPath(fileUrl);

      expect(convertedBack).toBe(originalPath);
    });
  });

  describe('import.meta.url behavior', () => {
    it('import.meta.url should be a file:// URL', () => {
      expect(import.meta.url).toMatch(/^file:\/\//);
    });

    it('import.meta.url should be convertible to path', () => {
      const path = fileURLToPath(import.meta.url);

      expect(path).not.toContain('file://');
      expect(isAbsolute(path)).toBe(true);
      expect(path).toMatch(/file-url\.test\.ts$/);
    });
  });

  describe('conditional file:// handling pattern', () => {
    it('should handle both file:// URLs and regular paths', () => {
      // This is the exact pattern used in get-package-json
      const handlePath = (input: string): string => {
        let filePath = input;
        if (filePath.startsWith('file://')) {
          filePath = fileURLToPath(filePath);
        }
        return filePath;
      };

      // ESM-style file:// URL
      const esmPath = handlePath('file:///Users/test/index.js');
      expect(esmPath).toBe('/Users/test/index.js');

      // CJS-style regular path
      const cjsPath = handlePath('/Users/test/index.js');
      expect(cjsPath).toBe('/Users/test/index.js');
    });
  });
});
