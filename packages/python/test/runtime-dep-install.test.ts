import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  calculateBundleSize,
  lambdaKnapsack,
  LAMBDA_SIZE_THRESHOLD_BYTES,
  LAMBDA_PACKING_TARGET_BYTES,
  LAMBDA_EPHEMERAL_STORAGE_BYTES,
} from '../src/runtime-dep-install';
import { classifyPackages, parseUvLock } from '@vercel/python-analysis';
import { FileFsRef, FileBlob } from '@vercel/build-utils';

describe('runtime dependency installation support', () => {
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
      const packages = [
        { name: 'a', size: 10 },
        { name: 'b', size: 20 },
        { name: 'c', size: 30 },
      ];
      const result = lambdaKnapsack(packages, 100);
      expect(result.bundled).toHaveLength(3);
      expect(result.deferred).toHaveLength(0);
      expect(result.bundled).toContain('a');
      expect(result.bundled).toContain('b');
      expect(result.bundled).toContain('c');
    });

    it('defers all packages when capacity is zero', () => {
      const packages = [
        { name: 'a', size: 10 },
        { name: 'b', size: 20 },
      ];
      const result = lambdaKnapsack(packages, 0);
      expect(result.bundled).toHaveLength(0);
      expect(result.deferred).toHaveLength(2);
    });

    it('defers all packages when capacity is negative', () => {
      const packages = [
        { name: 'a', size: 10 },
        { name: 'b', size: 20 },
      ];
      const result = lambdaKnapsack(packages, -5);
      expect(result.bundled).toHaveLength(0);
      expect(result.deferred).toEqual(['a', 'b']);
    });

    it('returns empty arrays for empty package list', () => {
      const result = lambdaKnapsack([], 100);
      expect(result.bundled).toHaveLength(0);
      expect(result.deferred).toHaveLength(0);
    });

    it('selects larger packages first for efficient packing', () => {
      // 49MB capacity, packages: 10MB, 20MB, 20MB
      // Should pick the two 20MB packages (40MB total) instead of
      // 20MB + 10MB (30MB total)
      const packages = [
        { name: 'pkg-10', size: 10 * 1024 * 1024 },
        { name: 'pkg-20a', size: 20 * 1024 * 1024 },
        { name: 'pkg-20b', size: 20 * 1024 * 1024 },
      ];
      const capacity = 49 * 1024 * 1024;
      const result = lambdaKnapsack(packages, capacity);
      expect(result.bundled).toEqual(['pkg-20a', 'pkg-20b']);
      expect(result.deferred).toEqual(['pkg-10']);
    });

    it('fills remaining capacity with smaller packages after large ones', () => {
      const packages = [
        { name: 'large', size: 100 },
        { name: 'medium', size: 40 },
        { name: 'small', size: 10 },
        { name: 'tiny', size: 5 },
      ];
      const result = lambdaKnapsack(packages, 150);
      // large (100) + medium (40) = 140, then small (10) = 150
      expect(result.bundled).toEqual(['large', 'medium', 'small']);
      expect(result.deferred).toEqual(['tiny']);
    });

    it('handles a single package that exactly fits', () => {
      const packages = [{ name: 'exact', size: 100 }];
      const result = lambdaKnapsack(packages, 100);
      expect(result.bundled).toEqual(['exact']);
      expect(result.deferred).toHaveLength(0);
    });

    it('defers a single package that is too large', () => {
      const packages = [{ name: 'toobig', size: 101 }];
      const result = lambdaKnapsack(packages, 100);
      expect(result.bundled).toHaveLength(0);
      expect(result.deferred).toEqual(['toobig']);
    });

    it('handles packages with zero size', () => {
      const packages = [
        { name: 'empty', size: 0 },
        { name: 'real', size: 50 },
      ];
      const result = lambdaKnapsack(packages, 50);
      expect(result.bundled).toContain('real');
      expect(result.bundled).toContain('empty');
      expect(result.deferred).toHaveLength(0);
    });

    it('does not mutate the input array', () => {
      const packages = [
        { name: 'c', size: 30 },
        { name: 'a', size: 10 },
        { name: 'b', size: 20 },
      ];
      const original = [...packages];
      lambdaKnapsack(packages, 50);
      expect(packages).toEqual(original);
    });

    it('packs many small packages efficiently', () => {
      // 10 packages of 10 bytes each, capacity of 95
      // Should fit 9 packages (90 bytes)
      const packages = Array.from({ length: 10 }, (_, i) => ({
        name: `pkg-${i}`,
        size: 10,
      }));
      const result = lambdaKnapsack(packages, 95);
      expect(result.bundled).toHaveLength(9);
      expect(result.deferred).toHaveLength(1);
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
