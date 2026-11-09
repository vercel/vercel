import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import { remove } from 'fs-extra';
import { existsSync } from 'node:fs';
import {
  acquireLock,
  removePackageInfoCache,
} from '../../../src/builders/vlt-builder-importer';
import { partitionBuilderSpecs } from '../../../src/builders/vlt-builder-routing';

describe('vlt Builder lock', () => {
  it('steals a lock whose holder is no longer running', async () => {
    const dir = await getWriteableDirectory();
    const lockPath = join(dir, 'locks', 'builder.lock');
    try {
      await mkdir(join(dir, 'locks'), { recursive: true });
      await writeFile(lockPath, '999999999\n');
      const lock = await acquireLock(lockPath, { waitMs: 1000 });
      try {
        expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`);
      } finally {
        await lock.close();
      }
    } finally {
      await remove(dir);
    }
  });

  it('steals an empty lock file left after a crash', async () => {
    const dir = await getWriteableDirectory();
    const lockPath = join(dir, 'locks', 'builder.lock');
    try {
      await mkdir(join(dir, 'locks'), { recursive: true });
      await writeFile(lockPath, '');
      const lock = await acquireLock(lockPath, {
        waitMs: 1000,
        emptyGraceMs: 0,
      });
      try {
        expect(await readFile(lockPath, 'utf8')).toBe(`${process.pid}\n`);
      } finally {
        await lock.close();
      }
    } finally {
      await remove(dir);
    }
  });

  it('does not steal a freshly created empty lock', async () => {
    const dir = await getWriteableDirectory();
    const lockPath = join(dir, 'locks', 'builder.lock');
    try {
      await mkdir(join(dir, 'locks'), { recursive: true });
      await writeFile(lockPath, '');
      await expect(
        acquireLock(lockPath, { waitMs: 80, emptyGraceMs: 1000 })
      ).rejects.toThrow('Timed out waiting for vlt Builder lock');
    } finally {
      await remove(dir);
    }
  });

  it('times out when the lock is held by a live process', async () => {
    const dir = await getWriteableDirectory();
    const lockPath = join(dir, 'locks', 'builder.lock');
    try {
      await mkdir(join(dir, 'locks'), { recursive: true });
      await writeFile(lockPath, `${process.pid}\n`);
      await expect(acquireLock(lockPath, { waitMs: 80 })).rejects.toThrow(
        'Timed out waiting for vlt Builder lock'
      );
    } finally {
      await remove(dir);
    }
  });
});

describe('vlt Builder routing', () => {
  it('routes only managed bare and latest specs into vlt', () => {
    const managedNames = new Set(['@vercel/node', '@vercel/next']);
    const specs = new Set([
      '@vercel/node',
      '@vercel/next@latest',
      '@vercel/node@10.0.0',
      '@vercel/next@canary',
      'custom-builder',
      'https://example.com/builder.tgz',
    ]);

    expect(partitionBuilderSpecs(specs, managedNames)).toEqual({
      managed: new Map([
        ['@vercel/node', '@vercel/node'],
        ['@vercel/next@latest', '@vercel/next'],
      ]),
      legacy: new Set([
        '@vercel/node@10.0.0',
        '@vercel/next@canary',
        'custom-builder',
        'https://example.com/builder.tgz',
      ]),
    });
  });
});

describe('vlt package-info cache cleanup', () => {
  it('waits for pending registry cache writes before removing the cache', async () => {
    const dir = await getWriteableDirectory();
    const cache = join(dir, '.vlt-package-info-cache');
    const registryCache = join(cache, 'registry-client');
    try {
      await mkdir(registryCache, { recursive: true });
      let cacheExistedWhenWriteLanded = false;
      const packageInfo = {
        getRegistryClient: async () =>
          ({
            cache: {
              // Simulates vlt's background write landing after install().
              promise: async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
                cacheExistedWhenWriteLanded = existsSync(registryCache);
                await writeFile(join(registryCache, 'late-entry'), 'data');
              },
            },
          }) as never,
      };

      await removePackageInfoCache(packageInfo, cache);

      expect(cacheExistedWhenWriteLanded).toBe(true);
      expect(existsSync(cache)).toBe(false);
    } finally {
      await remove(dir);
    }
  });

  it('still removes the cache when the registry client is unavailable', async () => {
    const dir = await getWriteableDirectory();
    const cache = join(dir, '.vlt-package-info-cache');
    try {
      await mkdir(join(cache, 'registry-client'), { recursive: true });
      const packageInfo = {
        getRegistryClient: async () => {
          throw new Error('registry client failed to load');
        },
      };

      await expect(
        removePackageInfoCache(packageInfo, cache)
      ).resolves.toBeUndefined();
      expect(existsSync(cache)).toBe(false);
    } finally {
      await remove(dir);
    }
  });
});
