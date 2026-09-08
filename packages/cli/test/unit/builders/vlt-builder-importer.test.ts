import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageInfoClient } from '@vltpkg/package-info';
import { getWriteableDirectory } from '@vercel/build-utils';
import { remove } from 'fs-extra';
import {
  acquireLock,
  EmbeddedPackageInfoClient,
} from '../../../src/builders/vlt-builder-importer';
import { partitionBuilderSpecs } from '../../../src/builders/vlt-builder-routing';

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe('vlt Builder importer', () => {
  it('times out hung remote tarball downloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason);
            });
          })
      )
    );
    const client = new EmbeddedPackageInfoClient({}, 20);
    await expect(
      client.extract({ final: { type: 'remote' } } as never, '/tmp/target', {
        resolved: 'https://preview.example/tarballs/builder.tgz',
        integrity: 'sha512-test',
      } as never)
    ).rejects.toThrow(
      'Timed out downloading remote Builder dependency https://preview.example/tarballs/builder.tgz'
    );
  });

  it('fetches and verifies remote tarballs without the registry cache', async () => {
    const bytes = new TextEncoder().encode('remote tarball');
    const integrity = `sha512-${createHash('sha512')
      .update(bytes)
      .digest('base64')}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes))
    );
    const unpack = vi.fn(async () => undefined);
    const prototype = PackageInfoClient.prototype as PackageInfoClient & {
      getTarPool(): Promise<{ unpack: typeof unpack }>;
    };
    vi.spyOn(prototype, 'getTarPool').mockResolvedValue({ unpack });
    const client = new EmbeddedPackageInfoClient();
    const spec = { final: { type: 'remote' } };

    await expect(
      client.extract(spec as never, '/tmp/target', {
        resolved: 'https://preview.example/tarballs/builder.tgz',
        integrity,
      } as never)
    ).resolves.toMatchObject({ integrity, resolved: expect.any(String) });
    expect(unpack).toHaveBeenCalledWith(bytes, '/tmp/target');

    await expect(
      client.extract(spec as never, '/tmp/target', {
        resolved: 'https://preview.example/tarballs/builder.tgz',
      } as never)
    ).rejects.toThrow('Missing integrity for remote Builder dependency');

    await expect(
      client.extract(spec as never, '/tmp/target', {
        resolved: 'https://preview.example/tarballs/builder.tgz',
        integrity: 'sha512-wrong',
      } as never)
    ).rejects.toThrow('Integrity check failed for remote Builder dependency');
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
