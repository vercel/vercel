import { afterEach, describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  PythonDependencyExternalizer,
  calculateBundleSize,
  lambdaKnapsack,
  LAMBDA_SIZE_THRESHOLD_BYTES,
  LAMBDA_PACKING_TARGET_BYTES,
  LAMBDA_EPHEMERAL_STORAGE_BYTES,
} from '../src/dependency-externalizer';
import { classifyPackages, parseUvLock } from '@vercel/python-analysis';
import { FileFsRef, FileBlob } from '@vercel/build-utils';

describe('dependency externalizer support', () => {
  describe('shouldEnableRuntimeInstall', () => {
    const originalEnv = process.env.VERCEL_PYTHON_ON_HIVE;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.VERCEL_PYTHON_ON_HIVE;
      } else {
        process.env.VERCEL_PYTHON_ON_HIVE = originalEnv;
      }
    });

    const oversized = LAMBDA_SIZE_THRESHOLD_BYTES + 1;
    const undersized = LAMBDA_SIZE_THRESHOLD_BYTES - 1;

    function createExternalizer({
      uvLockPath = '/path/to/uv.lock' as string | null,
      hasCustomCommand = false,
      totalBundleSize = 0,
    } = {}) {
      const ext = new PythonDependencyExternalizer({
        venvPath: '/tmp/venv',
        vendorDir: '_vendor',
        workPath: '/tmp/work',
        uvLockPath,
        uvProjectDir: '/tmp/work',
        projectName: 'test-project',
        noBuildCheckFailed: false,
        pythonPath: '/usr/bin/python3',
        hasCustomCommand,
      });
      // Set the private totalBundleSize field for testing
      (ext as any).totalBundleSize = totalBundleSize;
      return ext;
    }

    it('returns true when bundle exceeds threshold and uvLockPath is present', () => {
      delete process.env.VERCEL_PYTHON_ON_HIVE;
      const ext = createExternalizer({ totalBundleSize: oversized });
      expect(ext.shouldEnableRuntimeInstall()).toBe(true);
    });

    it('returns false when VERCEL_PYTHON_ON_HIVE is "1"', () => {
      process.env.VERCEL_PYTHON_ON_HIVE = '1';
      const ext = createExternalizer({ totalBundleSize: oversized });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });

    it('returns false when VERCEL_PYTHON_ON_HIVE is "true"', () => {
      process.env.VERCEL_PYTHON_ON_HIVE = 'true';
      const ext = createExternalizer({ totalBundleSize: oversized });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });

    it('returns true when VERCEL_PYTHON_ON_HIVE is an unrecognised value', () => {
      process.env.VERCEL_PYTHON_ON_HIVE = 'yes';
      const ext = createExternalizer({ totalBundleSize: oversized });
      expect(ext.shouldEnableRuntimeInstall()).toBe(true);
    });

    it('returns false when bundle is under threshold', () => {
      delete process.env.VERCEL_PYTHON_ON_HIVE;
      const ext = createExternalizer({ totalBundleSize: undersized });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });

    it('returns false when uvLockPath is null', () => {
      delete process.env.VERCEL_PYTHON_ON_HIVE;
      const ext = createExternalizer({
        totalBundleSize: oversized,
        uvLockPath: null,
      });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });

    it('returns false when hasCustomCommand is true even with oversized bundle and uvLockPath', () => {
      delete process.env.VERCEL_PYTHON_ON_HIVE;
      const ext = createExternalizer({
        totalBundleSize: oversized,
        hasCustomCommand: true,
      });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });

    it('returns false when hasCustomCommand is true and bundle is under threshold', () => {
      delete process.env.VERCEL_PYTHON_ON_HIVE;
      const ext = createExternalizer({
        totalBundleSize: undersized,
        hasCustomCommand: true,
      });
      expect(ext.shouldEnableRuntimeInstall()).toBe(false);
    });
  });

  describe('calculateBundleSize', () => {
    it('calculates size from FileFsRef objects', async () => {
      const tempDir = path.join(tmpdir(), `size-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Create test files with known sizes
      const file1Path = path.join(tempDir, 'file1.txt');
      const file2Path = path.join(tempDir, 'file2.txt');
      fs.writeFileSync(file1Path, 'a'.repeat(100)); // 100 bytes
      fs.writeFileSync(file2Path, 'b'.repeat(200)); // 200 bytes

      const files = {
        'file1.txt': new FileFsRef({ fsPath: file1Path }),
        'file2.txt': new FileFsRef({ fsPath: file2Path }),
      };

      try {
        const size = await calculateBundleSize(files);
        expect(size).toBe(300);
      } finally {
        fs.removeSync(tempDir);
      }
    });

    it('calculates size from FileBlob objects', async () => {
      const files = {
        'file1.txt': new FileBlob({ data: 'a'.repeat(100) }),
        'file2.txt': new FileBlob({ data: Buffer.from('b'.repeat(200)) }),
      };

      const size = await calculateBundleSize(files);
      expect(size).toBe(300);
    });

    it('returns 0 for empty files object', async () => {
      const size = await calculateBundleSize({});
      expect(size).toBe(0);
    });
  });

  describe('Lambda size constants', () => {
    it('LAMBDA_SIZE_THRESHOLD_BYTES is 249 MB', () => {
      expect(LAMBDA_SIZE_THRESHOLD_BYTES).toBe(249 * 1024 * 1024);
    });

    it('LAMBDA_EPHEMERAL_STORAGE_BYTES is 500 MB', () => {
      expect(LAMBDA_EPHEMERAL_STORAGE_BYTES).toBe(500 * 1024 * 1024);
    });

    it('ephemeral storage limit is greater than the bundle size threshold', () => {
      expect(LAMBDA_EPHEMERAL_STORAGE_BYTES).toBeGreaterThan(
        LAMBDA_SIZE_THRESHOLD_BYTES
      );
    });
  });

  describe('classifyPackages', () => {
    it('classifies PyPI packages as public', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "requests"
version = "2.31.0"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.publicPackages).toContain('requests');
      expect(result.privatePackages).not.toContain('requests');
      expect(result.packageVersions['requests']).toBe('2.31.0');
    });

    it('classifies git source packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "my-private-pkg"
version = "1.0.0"

[package.source]
git = "https://github.com/myorg/private-pkg.git"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('my-private-pkg');
      expect(result.publicPackages).not.toContain('my-private-pkg');
    });

    it('classifies path source packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "local-pkg"
version = "0.1.0"

[package.source]
path = "./packages/local-pkg"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('local-pkg');
      expect(result.publicPackages).not.toContain('local-pkg');
    });

    it('classifies non-PyPI registry packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "internal-pkg"
version = "1.0.0"

[package.source]
registry = "https://private.pypi.mycompany.com/simple"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('internal-pkg');
      expect(result.publicPackages).not.toContain('internal-pkg');
    });

    it('returns empty classification for empty lock file', () => {
      const lockFile = { packages: [] };
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toHaveLength(0);
      expect(result.publicPackages).toHaveLength(0);
    });

    it('excludes specified packages from classification', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "my-app"
version = "0.1.0"

[[package]]
name = "requests"
version = "2.31.0"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({
        lockFile,
        excludePackages: ['my-app'],
      });
      // my-app should be excluded entirely
      expect(result.publicPackages).not.toContain('my-app');
      expect(result.privatePackages).not.toContain('my-app');
      expect(result.packageVersions['my-app']).toBeUndefined();
      // requests should still be classified
      expect(result.publicPackages).toContain('requests');
    });
  });

  describe('lambdaKnapsack', () => {
    it('bundles all packages when they fit within capacity', () => {
      const packages = new Map([
        ['a', 10],
        ['b', 20],
        ['c', 30],
      ]);
      const result = lambdaKnapsack(packages, 100);
      expect(result).toHaveLength(3);
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });

    it('returns empty array when capacity is zero', () => {
      const packages = new Map([
        ['a', 10],
        ['b', 20],
      ]);
      const result = lambdaKnapsack(packages, 0);
      expect(result).toEqual([]);
    });

    it('returns empty array when capacity is negative', () => {
      const packages = new Map([
        ['a', 10],
        ['b', 20],
      ]);
      const result = lambdaKnapsack(packages, -5);
      expect(result).toEqual([]);
    });

    it('returns empty array for empty package map', () => {
      const result = lambdaKnapsack(new Map(), 100);
      expect(result).toHaveLength(0);
    });

    it('selects larger packages first for efficient packing', () => {
      // 49MB capacity, packages: 10MB, 20MB, 20MB
      // Should pick the two 20MB packages (40MB total) instead of
      // 20MB + 10MB (30MB total)
      const packages = new Map([
        ['pkg-10', 10 * 1024 * 1024],
        ['pkg-20a', 20 * 1024 * 1024],
        ['pkg-20b', 20 * 1024 * 1024],
      ]);
      const capacity = 49 * 1024 * 1024;
      const result = lambdaKnapsack(packages, capacity);
      expect(result).toEqual(['pkg-20a', 'pkg-20b']);
    });

    it('fills remaining capacity with smaller packages after large ones', () => {
      const packages = new Map<string, number>([
        ['large', 100],
        ['medium', 40],
        ['small', 10],
        ['tiny', 5],
      ]);
      const result = lambdaKnapsack(packages, 150);
      // large (100) + medium (40) = 140, then small (10) = 150
      expect(result).toEqual(['large', 'medium', 'small']);
    });

    it('handles a single package that exactly fits', () => {
      const packages = new Map([['exact', 100]]);
      const result = lambdaKnapsack(packages, 100);
      expect(result).toEqual(['exact']);
    });

    it('defers a single package that is too large', () => {
      const packages = new Map([['toobig', 101]]);
      const result = lambdaKnapsack(packages, 100);
      expect(result).toHaveLength(0);
    });

    it('handles packages with zero size', () => {
      const packages = new Map([
        ['empty', 0],
        ['real', 50],
      ]);
      const result = lambdaKnapsack(packages, 50);
      expect(result).toContain('real');
      expect(result).toContain('empty');
    });

    it('does not mutate the input map', () => {
      const packages = new Map([
        ['c', 30],
        ['a', 10],
        ['b', 20],
      ]);
      const original = new Map(packages);
      lambdaKnapsack(packages, 50);
      expect(packages).toEqual(original);
    });

    it('packs many small packages efficiently', () => {
      // 10 packages of 10 bytes each, capacity of 95
      // Should fit 9 packages (90 bytes)
      const packages = new Map(
        Array.from({ length: 10 }, (_, i) => [`pkg-${i}`, 10] as const)
      );
      const result = lambdaKnapsack(packages, 95);
      expect(result).toHaveLength(9);
    });
  });

  describe('LAMBDA_PACKING_TARGET_BYTES', () => {
    it('defaults to 245 MB', () => {
      expect(LAMBDA_PACKING_TARGET_BYTES).toBe(245 * 1024 * 1024);
    });

    it('is less than LAMBDA_SIZE_THRESHOLD_BYTES', () => {
      expect(LAMBDA_PACKING_TARGET_BYTES).toBeLessThan(
        LAMBDA_SIZE_THRESHOLD_BYTES
      );
    });
  });
});
