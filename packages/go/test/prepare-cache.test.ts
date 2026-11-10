import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmod,
  copy,
  lstat,
  mkdirp,
  pathExists,
  readdir,
  readFile,
  readlink,
  remove,
  rename,
  symlink,
  writeFile,
} from 'fs-extra';
import {
  download,
  type Files,
  type PrepareCacheOptions,
} from '@vercel/build-utils';
import { prepareCache } from '../src/index';
import { localCacheDir } from '../src/go-helpers';

vi.mock('fs-extra', async importOriginal => {
  const { default: fs } = await importOriginal<{
    default: typeof import('fs-extra');
  }>();
  return { ...fs, default: fs, copy: vi.fn(fs.copy), rename: vi.fn(fs.rename) };
});

// Stand-ins for the build container's layout:
//   ~/.cache/com.vercel.cli/golang/<ver>  <- "global" install createGo downloads into
//   <workPath>/.vercel/cache/golang       <- "local" cache, symlinked to the global one
const base = join(tmpdir(), 'vercel-go-test-prepare-cache');
const globalCacheDir = join(base, 'global', '1.27.0_linux_x64');
const repo = join(base, 'repo');
const serviceRoot = join(repo, 'services', 'api');
const workerRoot = join(repo, 'services', 'worker');
const installFiles = [
  ['bin/go', '#!/bin/sh\n', 0o100755],
  ['.vercel-go-install-complete', '1.27.0', 0o100644],
  ['pkg/mod/example.com/dep.go', 'package dep\n', 0o100644],
  ['go-build/trim.txt', 'build cache\n', 0o100644],
] as const;

async function fakeGoInstall(dir: string) {
  for (const [path, contents, mode] of installFiles) {
    const fsPath = join(dir, path);
    await mkdirp(dirname(fsPath));
    await writeFile(fsPath, contents);
    await chmod(fsPath, mode & 0o777);
  }
}

async function linkCache(workPath: string, target = globalCacheDir) {
  const localDir = join(workPath, localCacheDir);
  await mkdirp(dirname(localDir));
  await symlink(target, localDir);
  return localDir;
}

async function expectCache(files: Files, workPath: string, root = repo) {
  const localDir = join(workPath, localCacheDir);
  const prefix = relative(root, localDir);
  expect((await lstat(localDir)).isDirectory()).toBe(true);
  expect(Object.keys(files).sort()).toEqual(
    installFiles.map(([path]) => join(prefix, path)).sort()
  );
  for (const [path, contents, mode] of installFiles) {
    const key = join(prefix, path);
    const fsPath = join(root, key);
    expect(files[key]).toMatchObject({ type: 'FileFsRef', fsPath, mode });
    expect((await lstat(fsPath)).mode).toBe(mode);
    expect(await readFile(fsPath, 'utf8')).toBe(contents);
  }
}

function options(overrides: Partial<PrepareCacheOptions>): PrepareCacheOptions {
  return {
    files: {},
    entrypoint: 'main.go',
    workPath: repo,
    repoRootPath: repo,
    config: {},
    ...overrides,
  } as PrepareCacheOptions;
}

beforeEach(async () => {
  await remove(base);
  await mkdirp(serviceRoot);
});

afterEach(async () => {
  vi.resetAllMocks();
  await remove(base);
});

describe('prepareCache', () => {
  it.each([
    '.',
    'services/api',
    'backend',
  ])('materializes the %s cache with repo-relative file paths and modes', async directory => {
    await fakeGoInstall(globalCacheDir);
    const workPath = join(repo, directory);
    const localDir = await linkCache(workPath);

    const files = await prepareCache(options({ workPath }));

    await expectCache(files, workPath);
    expect(await readdir(dirname(localDir))).toEqual(['golang']);
    for (const [path, contents, mode] of installFiles) {
      expect(await readFile(join(globalCacheDir, path), 'utf8')).toBe(contents);
      expect((await lstat(join(globalCacheDir, path))).mode).toBe(mode);
    }
  });

  it.each([
    'sequential',
    'parallel',
  ])('prepares two services sharing one install in %s calls', async execution => {
    await fakeGoInstall(globalCacheDir);
    await linkCache(serviceRoot);
    await linkCache(workerRoot);

    const first = prepareCache(options({ workPath: serviceRoot }));
    if (execution === 'sequential') await first;
    const second = prepareCache(options({ workPath: workerRoot }));
    const [api, worker] = await Promise.all([first, second]);

    await expectCache(api, serviceRoot);
    await expectCache(worker, workerRoot);
    expect(await pathExists(join(globalCacheDir, 'bin', 'go'))).toBe(true);
    expect(copy).toHaveBeenCalledTimes(2);
    await writeFile(join(serviceRoot, localCacheDir, 'bin', 'go'), 'changed');
    await expectCache(worker, workerRoot);
    expect(await readFile(join(globalCacheDir, 'bin', 'go'), 'utf8')).toBe(
      '#!/bin/sh\n'
    );
  });

  it('persists restored service caches independently', async () => {
    await fakeGoInstall(join(serviceRoot, localCacheDir));
    await fakeGoInstall(join(workerRoot, localCacheDir));

    const first = await prepareCache(options({ workPath: serviceRoot }));
    const second = await prepareCache(options({ workPath: workerRoot }));

    await expectCache(first, serviceRoot);
    await expectCache(second, workerRoot);
    expect(await prepareCache(options({ workPath: serviceRoot }))).toEqual(
      first
    );
    expect(copy).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it('does not scan or mutate the repo-root cache for a service build', async () => {
    await fakeGoInstall(globalCacheDir);
    const rootCache = await linkCache(repo);

    const files = await prepareCache(options({ workPath: serviceRoot }));

    expect(files).toEqual({});
    expect((await lstat(rootCache)).isSymbolicLink()).toBe(true);
    expect(await pathExists(join(globalCacheDir, 'bin', 'go'))).toBe(true);
  });

  it('resolves a relative outer symlink through a shared alias', async () => {
    await fakeGoInstall(globalCacheDir);
    const sharedAlias = join(base, 'global', 'current');
    await symlink(relative(dirname(sharedAlias), globalCacheDir), sharedAlias);
    const target = relative(
      dirname(join(serviceRoot, localCacheDir)),
      sharedAlias
    );
    await linkCache(serviceRoot, target);

    const files = await prepareCache(options({ workPath: serviceRoot }));

    await expectCache(files, serviceRoot);
    expect((await lstat(sharedAlias)).isSymbolicLink()).toBe(true);
    expect(await pathExists(join(globalCacheDir, 'bin', 'go'))).toBe(true);
  });

  it.each([
    'missing',
    'dangling',
  ])('returns nothing without removing a %s cache', async state => {
    if (state === 'dangling') await linkCache(serviceRoot);

    const files = await prepareCache(options({ workPath: serviceRoot }));

    expect(files).toEqual({});
    if (state === 'dangling') {
      expect(await readlink(join(serviceRoot, localCacheDir))).toBe(
        globalCacheDir
      );
    }
    expect(copy).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls for one service until the copy is complete', async () => {
    await fakeGoInstall(globalCacheDir);
    const localDir = await linkCache(serviceRoot);
    const { default: fs } = await vi.importActual<{
      default: typeof import('fs-extra');
    }>('fs-extra');
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.mocked(copy).mockImplementationOnce(async (source, stagingDir) => {
      await writeFile(join(stagingDir, 'partial'), 'partial');
      await blocked;
      await remove(join(stagingDir, 'partial'));
      await fs.copy(source, stagingDir);
    });
    const completed = vi.fn((files: Files) => files);
    const calls = [
      prepareCache(options({ workPath: serviceRoot })).then(completed),
      prepareCache(options({ workPath: serviceRoot })).then(completed),
    ];
    const settled = Promise.allSettled(calls);
    try {
      await vi.waitFor(async () => {
        expect(copy).toHaveBeenCalledTimes(1);
        const stagingDir = vi.mocked(copy).mock.calls[0][1];
        expect(await pathExists(join(stagingDir, 'partial'))).toBe(true);
      });
      expect(completed).not.toHaveBeenCalled();
      expect(await readlink(localDir)).toBe(globalCacheDir);
      expect(await readFile(join(localDir, 'bin', 'go'), 'utf8')).toBe(
        '#!/bin/sh\n'
      );
    } finally {
      release();
      await settled;
    }

    for (const files of await Promise.all(calls)) {
      await expectCache(files, serviceRoot);
    }
    expect(copy).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readdir(dirname(localDir))).toEqual(['golang']);
  });

  it.each([
    'copy',
    'rename',
  ])('cleans read-only staging after a shared %s failure and allows retries', async operation => {
    await fakeGoInstall(globalCacheDir);
    const localDir = join(serviceRoot, localCacheDir);
    const target = relative(dirname(localDir), globalCacheDir);
    await linkCache(serviceRoot, target);
    const error = new Error(`${operation} failed`);
    const fail = async (source: string, destination: string) => {
      if (operation === 'copy') {
        const moduleDir = join(destination, 'pkg', 'mod', 'example.com');
        await mkdirp(moduleDir);
        await writeFile(join(moduleDir, 'partial'), 'partial');
        await symlink(globalCacheDir, join(moduleDir, 'shared-source'));
        await chmod(moduleDir, 0o555);
      } else {
        await chmod(join(source, 'pkg', 'mod', 'example.com'), 0o555);
        await expect(lstat(destination)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
      throw error;
    };
    if (operation === 'copy') vi.mocked(copy).mockImplementationOnce(fail);
    else vi.mocked(rename).mockImplementationOnce(fail);

    const results = await Promise.allSettled([
      prepareCache(options({ workPath: serviceRoot })),
      prepareCache(options({ workPath: serviceRoot })),
    ]);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(await readlink(localDir)).toBe(target);
    expect(await readdir(dirname(localDir))).toEqual(['golang']);
    expect(await readFile(join(localDir, 'bin', 'go'), 'utf8')).toBe(
      '#!/bin/sh\n'
    );
    expect(await pathExists(join(globalCacheDir, 'bin', 'go'))).toBe(true);

    const files = await prepareCache(options({ workPath: serviceRoot }));
    await expectCache(files, serviceRoot);
    expect(await readdir(dirname(localDir))).toEqual(['golang']);
  });

  it('roundtrips into a fresh repo without depending on the original caches', async () => {
    await fakeGoInstall(globalCacheDir);
    await linkCache(serviceRoot);
    const files = await prepareCache(options({ workPath: serviceRoot }));
    const freshRepo = join(base, 'restored');
    const freshServiceRoot = join(freshRepo, 'services', 'api');

    const restored = await download(files, freshRepo);
    await remove(repo);
    await remove(join(base, 'global'));

    await expectCache(restored, freshServiceRoot, freshRepo);
    const reused = await prepareCache(
      options({
        workPath: freshServiceRoot,
        repoRootPath: freshRepo,
      })
    );
    await expectCache(reused, freshServiceRoot, freshRepo);
    expect(copy).toHaveBeenCalledTimes(1);
  });
});
