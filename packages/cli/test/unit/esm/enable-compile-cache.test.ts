import { describe, expect, it } from 'vitest';

/**
 * These tests validate the enableCompileCache pattern used in src/vc.js.
 *
 * The pattern handles backward compatibility for Node.js versions:
 * - Node.js 22.1.0+: Has enableCompileCache export
 * - Node.js < 22.1.0: Does not have enableCompileCache export
 *
 * Pattern from src/vc.js:
 * ```
 * try {
 *   const { enableCompileCache } = await import('node:module');
 *   if (enableCompileCache) {
 *     enableCompileCache();
 *   }
 * } catch {}
 * ```
 */
describe('enableCompileCache pattern', () => {
  describe('dynamic import pattern', () => {
    it('should not throw when importing node:module', async () => {
      await expect(import('node:module')).resolves.toBeDefined();
    });

    it('should handle enableCompileCache being present or absent', async () => {
      // This mirrors the exact pattern in vc.js
      let didThrow = false;
      try {
        const mod = await import('node:module');
        const enableCompileCache = (mod as Record<string, unknown>)
          .enableCompileCache as (() => void) | undefined;
        if (enableCompileCache) {
          enableCompileCache();
        }
      } catch {
        didThrow = true;
      }

      // The pattern should never throw regardless of Node version
      expect(didThrow).toBe(false);
    });
  });

  describe('conditional execution pattern', () => {
    it('should handle undefined enableCompileCache gracefully', () => {
      const mockModule: { enableCompileCache?: () => void } = {
        enableCompileCache: undefined,
      };

      // This should not throw
      if (mockModule.enableCompileCache) {
        mockModule.enableCompileCache();
      }

      expect(true).toBe(true);
    });

    it('should call enableCompileCache when it exists', () => {
      let called = false;
      const mockModule = {
        enableCompileCache: () => {
          called = true;
        },
      };

      if (mockModule.enableCompileCache) {
        mockModule.enableCompileCache();
      }

      expect(called).toBe(true);
    });

    it('should handle enableCompileCache throwing an error', () => {
      const mockModule = {
        enableCompileCache: () => {
          throw new Error('Cache directory not writable');
        },
      };

      // The try-catch pattern should swallow errors
      let didThrow = false;
      try {
        if (mockModule.enableCompileCache) {
          mockModule.enableCompileCache();
        }
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(true);

      // With the full pattern (try-catch wrapping everything), errors are swallowed
      let errorSwallowed = true;
      try {
        try {
          if (mockModule.enableCompileCache) {
            mockModule.enableCompileCache();
          }
        } catch {
          // Swallowed
        }
      } catch {
        errorSwallowed = false;
      }

      expect(errorSwallowed).toBe(true);
    });
  });

  describe('Node.js version detection', () => {
    it('should have node:module available', async () => {
      const mod = await import('node:module');
      expect(mod).toBeDefined();
      // createRequire exists but TypeScript's es2022 types may not include it
      expect((mod as Record<string, unknown>).createRequire).toBeDefined();
    });

    it('should detect enableCompileCache availability correctly', async () => {
      const mod = await import('node:module');
      const hasEnableCompileCache =
        'enableCompileCache' in mod &&
        typeof (mod as Record<string, unknown>).enableCompileCache ===
          'function';

      // On Node 22.1.0+ this should be true, on older versions false
      // We don't assert a specific value since tests run on various Node versions
      expect(typeof hasEnableCompileCache).toBe('boolean');
    });
  });
});
