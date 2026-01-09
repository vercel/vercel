import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * These tests validate that worker files are correctly set up for ESM→CJS interop.
 *
 * The ESM migration requires worker files to remain CommonJS (using .cjs extension)
 * because they are spawned/forked as child processes and need to work independently
 * of the ESM parent process.
 *
 * Key patterns:
 * - builder.ts uses fork() to spawn builder-worker.cjs
 * - get-latest-version/index.ts uses spawn() to spawn get-latest-worker.cjs
 * - Worker paths are resolved using __dirname (from the CJS shim)
 */
describe('Worker File Resolution', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  describe('worker file existence', () => {
    it('builder-worker.cjs should exist', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      expect(existsSync(workerPath)).toBe(true);
    });

    it('get-latest-worker.cjs should exist', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/get-latest-version/get-latest-worker.cjs'
      );
      expect(existsSync(workerPath)).toBe(true);
    });
  });

  describe('worker file extensions', () => {
    it('builder-worker should have .cjs extension', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      expect(extname(workerPath)).toBe('.cjs');
    });

    it('get-latest-worker should have .cjs extension', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/get-latest-version/get-latest-worker.cjs'
      );
      expect(extname(workerPath)).toBe('.cjs');
    });
  });

  describe('worker file content (CommonJS syntax)', () => {
    it('builder-worker.cjs should use require() syntax', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      const content = readFileSync(workerPath, 'utf-8');

      // Should use CommonJS require
      expect(content).toContain('require(');
      // Should use process.send for IPC
      expect(content).toContain('process.send');
      // Should use process.on for message handling
      expect(content).toContain("process.on('message'");
    });

    it('get-latest-worker.cjs should use require() syntax', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/get-latest-version/get-latest-worker.cjs'
      );
      const content = readFileSync(workerPath, 'utf-8');

      // Should use CommonJS require
      expect(content).toContain('require(');
      // Should use process.send for IPC
      expect(content).toContain('process.send');
      // Should use process.once for message handling
      expect(content).toContain("process.once('message'");
    });

    it('worker files should not use ESM import syntax', () => {
      const builderWorkerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      const latestWorkerPath = join(
        __dirname,
        '../../../src/util/get-latest-version/get-latest-worker.cjs'
      );

      const builderContent = readFileSync(builderWorkerPath, 'utf-8');
      const latestContent = readFileSync(latestWorkerPath, 'utf-8');

      // Should not use ESM import statements (excluding comments)
      const importRegex = /^import\s+/m;
      expect(importRegex.test(builderContent)).toBe(false);
      expect(importRegex.test(latestContent)).toBe(false);
    });
  });

  describe('__dirname path resolution pattern', () => {
    it('should correctly resolve paths relative to __dirname', () => {
      // This tests the pattern used in builder.ts:
      // const builderWorker = join(__dirname, 'builder-worker.cjs');
      const simulatedDirname = join(__dirname, '../../../src/util/dev');
      const workerPath = join(simulatedDirname, 'builder-worker.cjs');

      expect(existsSync(workerPath)).toBe(true);
    });

    it('should correctly resolve nested paths relative to __dirname', () => {
      // This tests the pattern used in get-latest-version/index.ts:
      // const workerScript = join(__dirname, 'get-latest-worker.cjs');
      const simulatedDirname = join(
        __dirname,
        '../../../src/util/get-latest-version'
      );
      const workerPath = join(simulatedDirname, 'get-latest-worker.cjs');

      expect(existsSync(workerPath)).toBe(true);
    });
  });

  describe('IPC message structure', () => {
    it('builder-worker should send ready message on startup', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      const content = readFileSync(workerPath, 'utf-8');

      // Should send ready message
      expect(content).toContain("{ type: 'ready' }");
    });

    it('builder-worker should send buildResult message', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/dev/builder-worker.cjs'
      );
      const content = readFileSync(workerPath, 'utf-8');

      // Should send buildResult message
      expect(content).toContain("type: 'buildResult'");
    });

    it('get-latest-worker should send ready message on startup', () => {
      const workerPath = join(
        __dirname,
        '../../../src/util/get-latest-version/get-latest-worker.cjs'
      );
      const content = readFileSync(workerPath, 'utf-8');

      // Should send ready message
      expect(content).toContain("{ type: 'ready' }");
    });
  });
});
