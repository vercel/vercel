import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILDPACK_CACHE_DIR,
  buildpackCacheDir,
  CNB_CACHE_METADATA_FILE,
  CNB_COMMITTED_DIR,
  IMAGE_ID_FILE,
  restoreBuildpackCache,
  saveBuildpackCache,
} from '../src/buildpacks/cache';

vi.mock('node:fs', async importActual => ({
  ...(await importActual<typeof import('node:fs')>()),
}));

vi.mock('node:fs/promises', async importActual => ({
  ...(await importActual<typeof import('node:fs/promises')>()),
}));

const IMAGE = `sha256:${'a'.repeat(64)}`;

let scratch: string;
let dir: string;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'vercel-buildpack-cache-'));
  dir = join(scratch, 'repo', BUILDPACK_CACHE_DIR, 'app');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

/** Real layers are named `sha256:<id>.tar`, which is invalid on Windows. */
function committed(name: string, layers: Record<string, string>): string {
  const cacheDir = join(scratch, name);
  mkdirSync(join(cacheDir, CNB_COMMITTED_DIR), { recursive: true });
  for (const [file, contents] of Object.entries(layers)) {
    writeFileSync(join(cacheDir, CNB_COMMITTED_DIR, file), contents);
  }
  writeFileSync(
    join(cacheDir, CNB_COMMITTED_DIR, CNB_CACHE_METADATA_FILE),
    JSON.stringify(layers)
  );
  return cacheDir;
}

function emptyCacheDir(name: string): string {
  const cacheDir = join(scratch, name);
  mkdirSync(cacheDir);
  return cacheDir;
}

describe('buildpackCacheDir', () => {
  it('lives under the repository cache wherever the checkout is', () => {
    const a = buildpackCacheDir({
      repoRootPath: '/vercel/path0',
      workPath: '/vercel/path0',
    });
    const b = buildpackCacheDir({
      repoRootPath: '/vercel/path1',
      workPath: '/vercel/path1',
    });
    expect(dirname(a)).toBe(
      join(resolve('/vercel/path0'), BUILDPACK_CACHE_DIR)
    );
    expect(basename(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(basename(a)).toBe(basename(b));
  });

  it('separates applications and services', () => {
    const layouts = [
      { repoRootPath: '/r', workPath: '/r' },
      { repoRootPath: '/r', workPath: '/r/apps/web' },
      { repoRootPath: '/r', workPath: '/r/apps/web', service: { name: 'web' } },
      { repoRootPath: '/r', workPath: '/r/apps/web', service: { name: 'api' } },
      { repoRootPath: '/r', workPath: '/r', service: { name: 'root' } },
      {
        repoRootPath: '/r',
        workPath: '/r/apps/web-api',
        service: { name: 'web-api' },
      },
      {
        repoRootPath: '/r',
        workPath: '/r/apps/web',
        service: { name: 'web/api' },
      },
      {
        repoRootPath: '/r',
        workPath: '/r/apps/web',
        service: { name: 'web-api' },
      },
    ];
    const keys = new Set(layouts.map(l => basename(buildpackCacheDir(l))));
    expect(keys.size).toBe(layouts.length);
  });

  it('separates daemons that share a root from each other and from services', () => {
    const daemon = (name: string) => ({
      repoRootPath: '/r',
      workPath: '/r/backend',
      config: { daemon: { name } },
    });
    const keys = [
      daemon('worker'),
      daemon('scheduler'),
      {
        repoRootPath: '/r',
        workPath: '/r/backend',
        service: { name: 'worker' },
      },
      { repoRootPath: '/r', workPath: '/r/backend' },
    ].map(layout => basename(buildpackCacheDir(layout)));
    expect(new Set(keys).size).toBe(keys.length);
    // Service keys predate daemons, so existing caches must keep their keys.
    expect(
      basename(
        buildpackCacheDir({
          repoRootPath: '/r',
          workPath: '/r/backend',
          service: { name: 'api' },
        })
      )
    ).toBe(
      createHash('sha256')
        .update(JSON.stringify(['backend', 'api']))
        .digest('hex')
        .slice(0, 32)
    );
  });

  it('falls back to the work path without a repository root', () => {
    expect(buildpackCacheDir({ workPath: '/apps/web' })).toBe(
      buildpackCacheDir({ repoRootPath: '/apps/web', workPath: '/apps/web' })
    );
  });
});

describe('buildpack cache', () => {
  it('saves the committed cache and restores a private copy on the same image', async () => {
    const layers = { 'gems.tar': 'native gems' };
    const bytes = 'native gems'.length + JSON.stringify(layers).length;
    expect(
      await saveBuildpackCache(dir, IMAGE, committed('built', layers))
    ).toEqual({
      status: 'saved',
      bytes,
    });
    expect(readdirSync(dir).sort()).toEqual(
      [CNB_COMMITTED_DIR, IMAGE_ID_FILE].sort()
    );
    expect(readFileSync(join(dir, IMAGE_ID_FILE), 'utf8')).toBe(IMAGE);

    const cacheDir = emptyCacheDir('restore');
    expect(await restoreBuildpackCache(dir, IMAGE, cacheDir)).toEqual({
      status: 'hit',
      bytes,
    });
    const layer = join(cacheDir, CNB_COMMITTED_DIR, 'gems.tar');
    expect(readFileSync(layer, 'utf8')).toBe('native gems');
    writeFileSync(layer, 'rewritten by the lifecycle');
    expect(readFileSync(join(dir, CNB_COMMITTED_DIR, 'gems.tar'), 'utf8')).toBe(
      'native gems'
    );
  });

  it('misses without a saved cache or on another base image', async () => {
    const cacheDir = emptyCacheDir('restore');
    expect(await restoreBuildpackCache(dir, IMAGE, cacheDir)).toEqual({
      status: 'miss',
      reason: 'no_cache',
    });
    await saveBuildpackCache(
      dir,
      IMAGE,
      committed('built', { 'gems.tar': 'native gems' })
    );
    expect(await restoreBuildpackCache(dir, 'sha256:other', cacheDir)).toEqual({
      status: 'miss',
      reason: 'base_image_changed',
    });
    expect(existsSync(join(cacheDir, CNB_COMMITTED_DIR))).toBe(false);
  });

  it('copies the saved cache before the base image is known', async () => {
    await saveBuildpackCache(
      dir,
      IMAGE,
      committed('built', { 'gems.tar': 'native gems' })
    );
    const cacheDir = emptyCacheDir('restore');
    let resolveImage!: (imageId: string) => void;
    const imageId = new Promise<string>(resolve => {
      resolveImage = resolve;
    });
    const restoring = restoreBuildpackCache(dir, imageId, cacheDir);
    const layer = join(cacheDir, CNB_COMMITTED_DIR, 'gems.tar');
    try {
      await vi.waitFor(() =>
        expect(readFileSync(layer, 'utf8')).toBe('native gems')
      );
    } finally {
      resolveImage(IMAGE);
      await restoring;
    }
    expect(await restoring).toMatchObject({ status: 'hit' });
    expect(existsSync(layer)).toBe(true);
  });

  it('finishes pending copies before cleaning up after an image lookup failure', async () => {
    const source = committed('source', { 'gems.tar': 'native gems' });
    writeFileSync(join(source, IMAGE_ID_FILE), IMAGE);
    const copyFile = fsPromises.copyFile;
    const copying = vi
      .spyOn(fsPromises, 'copyFile')
      .mockImplementation(async (...args) => {
        await new Promise<void>(resolve => setImmediate(resolve));
        await copyFile(...args);
      });

    const result = await restoreBuildpackCache(
      source,
      Promise.reject(new Error('image lookup failed')),
      dir
    );
    await Promise.all(copying.mock.results.map(result => result.value));
    expect(result).toEqual({ status: 'miss', reason: 'image lookup failed' });
    expect(existsSync(join(dir, CNB_COMMITTED_DIR))).toBe(false);
  });

  it('leaves an unchanged cache in place and replaces a changed one', async () => {
    await saveBuildpackCache(
      dir,
      IMAGE,
      committed('first', { 'gems.tar': 'native gems' })
    );
    // Rewriting the directory would remove this file.
    const sentinel = join(dir, CNB_COMMITTED_DIR, 'sentinel');
    writeFileSync(sentinel, '');
    expect(
      await saveBuildpackCache(
        dir,
        IMAGE,
        committed('same', { 'gems.tar': 'native gems' })
      )
    ).toEqual({ status: 'unchanged' });
    expect(existsSync(sentinel)).toBe(true);

    expect(
      await saveBuildpackCache(
        dir,
        IMAGE,
        committed('updated', { 'gems-2.tar': 'updated gems' })
      )
    ).toMatchObject({ status: 'saved' });
    expect(readdirSync(join(dir, CNB_COMMITTED_DIR)).sort()).toEqual(
      [CNB_CACHE_METADATA_FILE, 'gems-2.tar'].sort()
    );

    expect(
      await saveBuildpackCache(
        dir,
        'sha256:rebased',
        committed('rebased', { 'gems-2.tar': 'updated gems' })
      )
    ).toMatchObject({ status: 'saved' });
    expect(readFileSync(join(dir, IMAGE_ID_FILE), 'utf8')).toBe(
      'sha256:rebased'
    );
  });

  it('keeps the previous cache when the lifecycle wrote none', async () => {
    await saveBuildpackCache(
      dir,
      IMAGE,
      committed('first', { 'gems.tar': 'native gems' })
    );
    expect(await saveBuildpackCache(dir, IMAGE, emptyCacheDir('none'))).toEqual(
      {
        status: 'skipped',
        reason: 'no_cache_written',
      }
    );
    expect(readFileSync(join(dir, CNB_COMMITTED_DIR, 'gems.tar'), 'utf8')).toBe(
      'native gems'
    );
  });

  it.each([
    'save',
    'restore',
  ] as const)('waits for pending copies before cleaning up a failed %s', async operation => {
    const source = committed('source', {
      'broken.tar': 'broken',
      'gems.tar': 'native gems',
    });
    writeFileSync(join(source, IMAGE_ID_FILE), IMAGE);
    const copyFile = fsPromises.copyFile;
    const copying = vi
      .spyOn(fsPromises, 'copyFile')
      .mockImplementation(async (from, to, mode) => {
        if (basename(String(from)) === 'broken.tar') {
          throw new Error('copy failed');
        }
        // Keep these copies pending until the first failure has propagated.
        await new Promise<void>(resolve => setImmediate(resolve));
        await copyFile(from, to, mode);
      });

    const result =
      operation === 'save'
        ? await saveBuildpackCache(dir, IMAGE, source)
        : await restoreBuildpackCache(source, IMAGE, dir);
    const copies = await Promise.allSettled(
      copying.mock.results.map(result => result.value)
    );

    expect(copies.filter(copy => copy.status === 'rejected')).toHaveLength(1);
    expect(result).toEqual({
      status: operation === 'save' ? 'skipped' : 'miss',
      reason: 'copy failed',
    });
    expect(existsSync(join(dir, CNB_COMMITTED_DIR))).toBe(false);
  });

  it('skips a failed cache save even when cleanup fails', async () => {
    const source = committed('source', { 'gems.tar': 'native gems' });
    vi.spyOn(fsPromises, 'copyFile').mockRejectedValue(
      new Error('copy failed')
    );
    const remove = fs.rmSync;
    const cleanup = vi
      .spyOn(fs, 'rmSync')
      .mockImplementation((path, options) => {
        if (existsSync(join(dir, CNB_COMMITTED_DIR))) {
          throw new Error('cleanup failed');
        }
        remove(path, options);
      });

    expect(await saveBuildpackCache(dir, IMAGE, source)).toEqual({
      status: 'skipped',
      reason: 'copy failed',
    });
    cleanup.mockRestore();
    expect(
      await restoreBuildpackCache(dir, IMAGE, emptyCacheDir('restore'))
    ).toEqual({
      status: 'miss',
      reason: 'no_cache',
    });
  });

  it('refuses to save a directory as a layer', async () => {
    await saveBuildpackCache(
      dir,
      IMAGE,
      committed('first', { 'gems.tar': 'native gems' })
    );
    const broken = committed('broken', { 'gems.tar': 'updated gems' });
    mkdirSync(join(broken, CNB_COMMITTED_DIR, 'not-a-layer'));
    expect(await saveBuildpackCache(dir, IMAGE, broken)).toMatchObject({
      status: 'skipped',
    });
    expect(existsSync(dir)).toBe(false);
  });
});

describe('buildpack cache links', () => {
  const layers = { 'gems.tar': 'native gems' };
  let secret: string;
  beforeEach(() => {
    secret = join(scratch, 'secret');
    writeFileSync(secret, 'host secret');
  });

  /** Replace `path` with a symlink to `target`. */
  function link(target: string, path: string): void {
    rmSync(path, { recursive: true, force: true });
    symlinkSync(target, path);
  }

  it('refuses to save a linked layer', async () => {
    const built = committed('built', layers);
    link(secret, join(built, CNB_COMMITTED_DIR, 'leak.tar'));
    expect(await saveBuildpackCache(dir, IMAGE, built)).toEqual({
      status: 'skipped',
      reason: '"leak.tar" is not a regular file',
    });
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses linked metadata and keeps the previous cache', async () => {
    await saveBuildpackCache(dir, IMAGE, committed('first', layers));
    const built = committed('built', { 'gems-2.tar': 'updated gems' });
    link(secret, join(built, CNB_COMMITTED_DIR, CNB_CACHE_METADATA_FILE));
    expect(await saveBuildpackCache(dir, IMAGE, built)).toEqual({
      status: 'skipped',
      reason: `"${CNB_CACHE_METADATA_FILE}" is not a regular file`,
    });
    expect(readFileSync(join(dir, CNB_COMMITTED_DIR, 'gems.tar'), 'utf8')).toBe(
      'native gems'
    );
  });

  it('refuses to save a linked committed directory', async () => {
    const elsewhere = committed('elsewhere', layers);
    const built = emptyCacheDir('built');
    link(join(elsewhere, CNB_COMMITTED_DIR), join(built, CNB_COMMITTED_DIR));
    expect(await saveBuildpackCache(dir, IMAGE, built)).toEqual({
      status: 'skipped',
      reason: `${CNB_COMMITTED_DIR} is not a directory`,
    });
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses to restore a linked layer', async () => {
    await saveBuildpackCache(dir, IMAGE, committed('built', layers));
    link(secret, join(dir, CNB_COMMITTED_DIR, 'leak.tar'));
    const cacheDir = emptyCacheDir('restore');
    expect(await restoreBuildpackCache(dir, IMAGE, cacheDir)).toEqual({
      status: 'miss',
      reason: '"leak.tar" is not a regular file',
    });
    expect(existsSync(join(cacheDir, CNB_COMMITTED_DIR))).toBe(false);
  });

  it('refuses to restore a linked committed directory', async () => {
    await saveBuildpackCache(dir, IMAGE, committed('built', layers));
    const elsewhere = committed('elsewhere', layers);
    link(join(elsewhere, CNB_COMMITTED_DIR), join(dir, CNB_COMMITTED_DIR));
    const cacheDir = emptyCacheDir('restore');
    expect(await restoreBuildpackCache(dir, IMAGE, cacheDir)).toEqual({
      status: 'miss',
      reason: `${CNB_COMMITTED_DIR} is not a directory`,
    });
    expect(existsSync(join(cacheDir, CNB_COMMITTED_DIR))).toBe(false);
  });

  it('distrusts a linked image id and replaces it on the next save', async () => {
    await saveBuildpackCache(dir, IMAGE, committed('first', layers));
    writeFileSync(secret, IMAGE);
    link(secret, join(dir, IMAGE_ID_FILE));
    expect(
      await restoreBuildpackCache(dir, IMAGE, emptyCacheDir('restore'))
    ).toEqual({
      status: 'miss',
      reason: `"${IMAGE_ID_FILE}" is not a regular file`,
    });
    // Equal metadata would otherwise leave the link in place as "unchanged".
    expect(
      await saveBuildpackCache(dir, IMAGE, committed('same', layers))
    ).toMatchObject({ status: 'saved' });
    expect(lstatSync(join(dir, IMAGE_ID_FILE)).isFile()).toBe(true);
  });
});
