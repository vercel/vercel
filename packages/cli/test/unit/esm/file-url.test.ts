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
  const isWindows = process.platform === 'win32';

  describe('fileURLToPath conversion', () => {
    it('should convert file:// URLs to regular paths (platform-specific)', () => {
      // Use the current file as a known-good test case
      const currentFileUrl = import.meta.url;
      const filePath = fileURLToPath(currentFileUrl);

      expect(filePath).not.toContain('file://');
      expect(isAbsolute(filePath)).toBe(true);
    });

    it('should handle paths with spaces (encoded as %20)', () => {
      // Create a file URL from a path with spaces, then convert back
      const testPath = isWindows
        ? 'C:\\Users\\test\\my project\\index.js'
        : '/Users/test/my project/index.js';
      const fileUrl = pathToFileURL(testPath);
      const filePath = fileURLToPath(fileUrl);

      expect(filePath).toContain('my project');
      expect(filePath).not.toContain('%20');
    });

    it('should handle paths with special characters', () => {
      const testPath = isWindows
        ? 'C:\\Users\\test\\project@v2\\index.js'
        : '/Users/test/project@v2/index.js';
      const fileUrl = pathToFileURL(testPath);
      const filePath = fileURLToPath(fileUrl);

      expect(filePath).toContain('project@v2');
    });

    it('should produce absolute paths', () => {
      const filePath = fileURLToPath(import.meta.url);
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
      const testPath = isWindows
        ? 'C:\\Users\\test\\project\\index.js'
        : '/Users/test/project/index.js';
      const fileUrl = pathToFileURL(testPath);

      expect(fileUrl.href).toMatch(/^file:\/\/\//);
      expect(fileUrl.protocol).toBe('file:');
    });

    it('should encode spaces in paths', () => {
      const testPath = isWindows
        ? 'C:\\Users\\test\\my project\\index.js'
        : '/Users/test/my project/index.js';
      const fileUrl = pathToFileURL(testPath);

      expect(fileUrl.href).toContain('%20');
    });

    it('should be reversible with fileURLToPath', () => {
      const testPath = isWindows
        ? 'C:\\Users\\test\\project\\index.js'
        : '/Users/test/project/index.js';
      const fileUrl = pathToFileURL(testPath);
      const convertedBack = fileURLToPath(fileUrl);

      expect(convertedBack).toBe(testPath);
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

      // Test with actual current file
      const currentUrl = import.meta.url;
      const currentPath = fileURLToPath(currentUrl);

      // ESM-style file:// URL
      const esmResult = handlePath(currentUrl);
      expect(esmResult).toBe(currentPath);

      // CJS-style regular path (already a path, unchanged)
      const cjsResult = handlePath(currentPath);
      expect(cjsResult).toBe(currentPath);
    });

    it('should not modify paths that do not start with file://', () => {
      const handlePath = (input: string): string => {
        let filePath = input;
        if (filePath.startsWith('file://')) {
          filePath = fileURLToPath(filePath);
        }
        return filePath;
      };

      const regularPath = isWindows
        ? 'C:\\some\\path\\file.js'
        : '/some/path/file.js';
      expect(handlePath(regularPath)).toBe(regularPath);
    });
  });
});
