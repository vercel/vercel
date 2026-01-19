import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { readLockfileVersion } from '../src';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Test `readLockfileVersion()`', () => {
  const fixturesPath = join(__dirname, 'fixtures');
  const tempDir = join(__dirname, 'temp-lockfile-test');

  beforeAll(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('pnpm-lock.yaml', () => {
    it('should extract lockfileVersion from pnpm-lock.yaml', async () => {
      const lockfilePath = join(fixturesPath, '22-pnpm', 'pnpm-lock.yaml');
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 9.0 });
    });

    it('should extract lockfileVersion 6.0 from pnpm v8 lockfile', async () => {
      const lockfilePath = join(fixturesPath, '28-pnpm-v8', 'pnpm-lock.yaml');
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 6.0 });
    });

    it('should handle quoted lockfileVersion in pnpm-lock.yaml', async () => {
      const testFile = join(tempDir, 'pnpm-lock.yaml');
      await writeFile(testFile, "lockfileVersion: '5.4'\n\nimporters:\n  .:\n");
      const result = await readLockfileVersion(testFile);
      expect(result).toEqual({ lockfileVersion: 5.4 });
    });

    it('should handle unquoted lockfileVersion in pnpm-lock.yaml', async () => {
      const testFile = join(tempDir, 'pnpm-lock.yaml');
      await writeFile(testFile, 'lockfileVersion: 6.1\n\nimporters:\n  .:\n');
      const result = await readLockfileVersion(testFile);
      expect(result).toEqual({ lockfileVersion: 6.1 });
    });
  });

  describe('package-lock.json', () => {
    it('should extract lockfileVersion from package-lock.json', async () => {
      const lockfilePath = join(fixturesPath, '20-npm-7', 'package-lock.json');
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 2 });
    });

    it('should extract lockfileVersion 1 from npm 6 lockfile', async () => {
      const lockfilePath = join(
        fixturesPath,
        '14-npm-6-legacy-peer-deps',
        'package-lock.json'
      );
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 1 });
    });

    it('should handle lockfileVersion in package-lock.json with various formats', async () => {
      const testFile = join(tempDir, 'package-lock.json');
      await writeFile(
        testFile,
        '{\n  "name": "test",\n  "lockfileVersion": 3,\n  "requires": true\n}'
      );
      const result = await readLockfileVersion(testFile);
      expect(result).toEqual({ lockfileVersion: 3 });
    });
  });

  describe('bun.lock', () => {
    it('should extract lockfileVersion 0 from bun.lock', async () => {
      const lockfilePath = join(fixturesPath, '32-bun-v1-lock', 'bun.lock');
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 0 });
    });

    it('should extract lockfileVersion 1 from bun.lock', async () => {
      const lockfilePath = join(fixturesPath, '45-bun-lock-v1', 'bun.lock');
      const result = await readLockfileVersion(lockfilePath);
      expect(result).toEqual({ lockfileVersion: 1 });
    });

    it('should handle bun.lock with various formats', async () => {
      const testFile = join(tempDir, 'bun.lock');
      await writeFile(
        testFile,
        '{\n  "lockfileVersion": 2,\n  "workspaces": {}\n}'
      );
      const result = await readLockfileVersion(testFile);
      expect(result).toEqual({ lockfileVersion: 2 });
    });
  });

  describe('non-existent files', () => {
    it('should return null for non-existent pnpm-lock.yaml', async () => {
      const result = await readLockfileVersion(
        join(tempDir, 'non-existent', 'pnpm-lock.yaml')
      );
      expect(result).toBeNull();
    });

    it('should return null for non-existent package-lock.json', async () => {
      const result = await readLockfileVersion(
        join(tempDir, 'non-existent', 'package-lock.json')
      );
      expect(result).toBeNull();
    });

    it('should return null for non-existent bun.lock', async () => {
      const result = await readLockfileVersion(
        join(tempDir, 'non-existent', 'bun.lock')
      );
      expect(result).toBeNull();
    });
  });

  describe('fallback to full parsing', () => {
    it('should fall back to full parsing for unknown lockfile types', async () => {
      // Create a JSON file with a different name that still has lockfileVersion
      const testFile = join(tempDir, 'custom-lock.json');
      await writeFile(
        testFile,
        '{\n  "lockfileVersion": 5,\n  "dependencies": {}\n}'
      );
      const result = await readLockfileVersion(testFile);
      // Falls back to readConfigFile which returns the full parsed object
      expect(result).toMatchObject({ lockfileVersion: 5 });
    });
  });
});
