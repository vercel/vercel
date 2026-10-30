import { Span } from '@vercel/build-utils';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, join, normalize } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILDAH_STORE_CACHE_DIR,
  BuildahStoreCache,
} from '../src/buildah-store-cache/cache';
import { buildahStoreCacheEnabled } from '../src/buildah-store-cache/config';
import { buildahStoreStateDirectory } from '../src/buildah-store-cache/state';
import { STORE_COMMAND_SCRIPT } from '../src/buildah-store-cache/command';
import type {
  RestoreOptions,
  RestoreResult,
  SaveOptions,
  SaveResult,
  StoreCommandRequest,
} from '../src/buildah-store-cache/command/types';
import {
  BuildahImageUsage,
  imageIdsFromBuildOutput,
} from '../src/buildah-store-cache/usage';
import {
  __resetFlockAvailability,
  sharedBuildahStoreLock,
} from '../src/buildah-store-cache/lock';
import { BuildahClient } from '../src/clients/buildah';
import { BUILDAH_GRAPH_ROOT, buildahStorageArgs } from '../src/storage-driver';
import type { RunResult } from '../src/util';

const { runMock, hasCommandMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  hasCommandMock: vi.fn<typeof import('../src/util').hasCommand>(),
}));

vi.mock('../src/util', async importActual => ({
  ...(await importActual<typeof import('../src/util')>()),
  run: runMock,
  hasCommand: hasCommandMock,
}));

const BLOB_INFO_CACHE = '/var/lib/containers/cache/blob-info-cache-v1.sqlite';

let root: string;
let cache: BuildahStoreCache;
let version: string;
const restoreMock = vi.fn<(options: RestoreOptions) => Promise<RunResult>>();
const saveMock = vi.fn<(options: SaveOptions) => Promise<RunResult>>();

function storeResponse(result: RestoreResult | SaveResult) {
  return { stdout: `${JSON.stringify(result)}\n`, stderr: '' };
}

function storeRequest(args: string[]) {
  return JSON.parse(
    args[args.indexOf(STORE_COMMAND_SCRIPT) + 1]
  ) as StoreCommandRequest;
}

async function saveSnapshot() {
  saveMock.mockImplementationOnce(async ({ archive }) => {
    writeFileSync(archive, 'complete snapshot');
    return storeResponse({ status: 'saved' });
  });
  return cache.save();
}

function useDeployment(id: string): void {
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', id);
  cache = BuildahStoreCache.forProject(
    { workPath: root },
    new BuildahClient(sharedBuildahStoreLock)
  );
}

function snapshotDirectory(): string {
  return join(root, BUILDAH_STORE_CACHE_DIR);
}

beforeEach(() => {
  root = realpathSync.native(
    mkdtempSync(join(tmpdir(), 'vercel-buildah-store-test-'))
  );
  // Keeps per-deployment state and the lock file out of the shared temp directory.
  const temporaryDirectory = join(root, 'tmp');
  mkdirSync(temporaryDirectory);
  vi.stubEnv('TMPDIR', temporaryDirectory);
  vi.stubEnv('TMP', temporaryDirectory);
  vi.stubEnv('TEMP', temporaryDirectory);
  version = 'buildah version 1.39.0';
  restoreMock.mockReset();
  saveMock.mockReset();
  vi.stubEnv('VERCEL_BUILD_IMAGE', 'al2023');
  vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
  useDeployment(basename(root));
  __resetFlockAvailability();
  hasCommandMock.mockResolvedValue(true);
  runMock.mockImplementation(async (command: string, args: string[]) => {
    if (command === 'buildah') return { stdout: version, stderr: '' };
    const request = storeRequest(args);
    if (request.action === 'restore') return restoreMock(request.options);
    if (request.action === 'save') return saveMock(request.options);
    throw new Error(`unexpected store command action: ${request.action}`);
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  runMock.mockReset();
  hasCommandMock.mockReset();
  __resetFlockAvailability();
});

describe('Buildah store cache settings', () => {
  it('requires the build container, the flag and a deployment ID', () => {
    expect(buildahStoreCacheEnabled()).toBe(true);
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    expect(buildahStoreCacheEnabled()).toBe(false);
    useDeployment('dpl_test');
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '0');
    expect(buildahStoreCacheEnabled()).toBe(false);
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '1');
    vi.stubEnv('VERCEL_BUILD_IMAGE', '');
    expect(buildahStoreCacheEnabled()).toBe(false);
  });
});

describe('Buildah image usage', () => {
  it('records cached and rebuilt images, including IDs after unterminated output', () => {
    expect(
      imageIdsFromBuildOutput(
        [
          '[1/2] STEP 1/3: FROM alpine AS build',
          '--> Using cache aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          '--> bbbbbbbbbbbb',
          '[2/2] STEP 1/2: RUN printf done',
          'done--> cccccccccccc',
          '--> Using cache aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          '--> Cache pulled from remote 127.0.0.1:1/cache:7a42cd42',
          'Copying blob sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        ].join('\n')
      )
    ).toEqual(['a'.repeat(64), 'b'.repeat(12), 'c'.repeat(12)]);
  });

  it('keeps a pending record until the image list is recorded', async () => {
    const usage = (await BuildahImageUsage.begin())!;
    const directory = buildahStoreStateDirectory();
    const [file] = readdirSync(directory);
    expect(readFileSync(join(directory, file), 'utf8')).toBe('pending\n');
    await usage.record(() => [`sha256:${'a'.repeat(64)}`, 'b'.repeat(12)]);
    expect(readFileSync(join(directory, file), 'utf8')).toBe(
      `${'a'.repeat(64)}\n${'b'.repeat(12)}\n`
    );
    expect(readdirSync(directory)).toEqual([file]);
  });

  it("combines services without overwriting another process's record", async () => {
    const [api, web] = await Promise.all([
      BuildahImageUsage.begin(),
      BuildahImageUsage.begin(),
    ]);
    await Promise.all([
      api!.record(() => ['a'.repeat(64)]),
      web!.record(() => ['b'.repeat(64)]),
    ]);
    const directory = buildahStoreStateDirectory();
    expect(
      readdirSync(directory)
        .map(file => readFileSync(join(directory, file), 'utf8'))
        .sort()
    ).toEqual([`${'a'.repeat(64)}\n`, `${'b'.repeat(64)}\n`]);
  });

  it.each([
    ['no image IDs', () => []],
    [
      'a failed lookup',
      () => Promise.reject(new Error('inspect failed')) as Promise<string[]>,
    ],
  ])('leaves the record pending after %s', async (_case, images) => {
    const usage = (await BuildahImageUsage.begin())!;
    await expect(usage.record(images)).resolves.toBeUndefined();
    const directory = buildahStoreStateDirectory();
    const [file] = readdirSync(directory);
    expect(readFileSync(join(directory, file), 'utf8')).toBe('pending\n');
  });

  it('records nothing while the cache is disabled', async () => {
    vi.stubEnv('VERCEL_BUILDAH_STORE_CACHE', '0');
    await expect(BuildahImageUsage.begin()).resolves.toBeUndefined();
    expect(existsSync(buildahStoreStateDirectory())).toBe(false);
  });
});

describe('Buildah store snapshot lifecycle', () => {
  it('returns the snapshot inside the repository', async () => {
    const files = await saveSnapshot();
    const [name] = Object.keys(files);
    expect(Object.keys(files)).toHaveLength(1);
    expect(name).toMatch(
      /^\.vercel\/cache\/buildah-store\/store-[a-f0-9]{32}\.tar\.zst$/
    );
    expect(normalize((files[name] as { fsPath: string }).fsPath)).toBe(
      join(root, name)
    );
  });

  it('runs the packaged Node store command with named options, a separate restore gate and CPU budget', async () => {
    const files = await saveSnapshot();
    const archive = realpathSync.native(join(root, Object.keys(files)[0]));
    const state = buildahStoreStateDirectory();
    const storeLock = join(tmpdir(), 'vercel-buildah-store.lock');
    const [, saveArgs] = runMock.mock.calls.find(
      ([command]) => command === 'flock'
    )!;
    expect(runMock).toHaveBeenLastCalledWith(
      'flock',
      [
        '--exclusive',
        '--close',
        storeLock,
        process.execPath,
        STORE_COMMAND_SCRIPT,
        expect.any(String),
      ],
      { quiet: true }
    );
    expect(storeRequest(saveArgs)).toEqual({
      action: 'save',
      options: {
        graphRoot: BUILDAH_GRAPH_ROOT,
        archive,
        stateDirectory: state,
        threads: availableParallelism(),
        blobInfoCache: BLOB_INFO_CACHE,
        buildahArgs: await buildahStorageArgs(),
      },
    });

    restoreMock.mockResolvedValue(storeResponse({ status: 'skipped' }));
    await cache.restore();
    const [, restoreArgs] = runMock.mock.calls.at(-1)!;
    expect(runMock).toHaveBeenLastCalledWith(
      'flock',
      [
        '--exclusive',
        '--close',
        join(state, 'restore.lock'),
        process.execPath,
        STORE_COMMAND_SCRIPT,
        expect.any(String),
      ],
      { quiet: true }
    );
    expect(storeRequest(restoreArgs)).toEqual({
      action: 'restore',
      options: {
        graphRoot: BUILDAH_GRAPH_ROOT,
        archive,
        storeLock,
        marker: join(state, 'restored'),
        blobInfoCache: BLOB_INFO_CACHE,
      },
    });
  });

  it.each([
    'hit',
    'miss',
    'failed',
  ])('removes the snapshot directory from the checkout after a %s restore', async outcome => {
    await saveSnapshot();
    useDeployment('next-deployment');
    if (outcome === 'failed') {
      restoreMock.mockRejectedValue(new Error('tar: invalid archive'));
    } else {
      restoreMock.mockResolvedValue(
        storeResponse(
          outcome === 'hit'
            ? { status: 'hit', bytes: 17 }
            : { status: 'miss', reason: 'no_compatible_snapshot' }
        )
      );
    }
    writeFileSync(join(snapshotDirectory(), 'store-old.tar.zst.Ab12Cd'), 'x');
    await expect(cache.restore()).resolves.toBeUndefined();
    expect(restoreMock).toHaveBeenCalledOnce();
    expect(existsSync(snapshotDirectory())).toBe(false);
  });

  it.each([
    'version',
    'storage configuration',
  ])('uses a different snapshot key after changing %s', async change => {
    const configuration = join(root, 'storage.conf');
    writeFileSync(configuration, '[storage]\ndriver = "overlay"\n');
    vi.stubEnv('CONTAINERS_STORAGE_CONF', configuration);
    const previous = await saveSnapshot();
    useDeployment('next-deployment');
    if (change === 'version') {
      version = 'buildah version 1.40.0';
    } else {
      writeFileSync(configuration, '[storage]\ndriver = "vfs"\n');
    }
    restoreMock.mockResolvedValue(
      storeResponse({ status: 'miss', reason: 'no_compatible_snapshot' })
    );
    await cache.restore();
    expect(restoreMock).toHaveBeenCalledOnce();
    expect(restoreMock.mock.calls[0][0].archive).not.toBe(
      join(root, Object.keys(previous)[0])
    );
  });

  it('rejects an unexpected restore result and still removes the snapshot', async () => {
    await saveSnapshot();
    useDeployment('next-deployment');
    restoreMock.mockResolvedValue({ stdout: 'unexpected output', stderr: '' });
    await expect(cache.restore()).resolves.toBeUndefined();
    expect(existsSync(snapshotDirectory())).toBe(false);
  });

  it('reports the restore byte count returned by the store command', async () => {
    await saveSnapshot();
    useDeployment('next-deployment');
    restoreMock.mockResolvedValue(storeResponse({ status: 'hit', bytes: 42 }));
    const span = new Span({ name: 'restore' });
    const setAttributes = vi.spyOn(span, 'setAttributes');
    await span.trace(() => cache.restore(span));
    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'container.buildah_store.restore': 'hit',
        'container.buildah_store.restore_bytes': '42',
      })
    );
    expect(existsSync(snapshotDirectory())).toBe(false);
  });

  it.each([
    'unexpected output',
    'saved\n',
  ])('rejects invalid save output without replacing the previous snapshot: %s', async output => {
    const previous = await saveSnapshot();
    const archive = join(root, Object.keys(previous)[0]);
    useDeployment('next-deployment');
    saveMock.mockResolvedValue({ stdout: output, stderr: '' });
    await expect(cache.save()).resolves.toEqual({});
    expect(readFileSync(archive, 'utf8')).toBe('complete snapshot');
  });

  it.each<{ result: SaveResult; count: number }>([
    { result: { status: 'skipped', previous: 'saved' }, count: 1 },
    { result: { status: 'skipped', previous: 'unused' }, count: 1 },
    { result: { status: 'skipped', previous: 'failed' }, count: 0 },
  ])('returns $count snapshots for an earlier $result.previous prepareCache call', async ({
    result,
    count,
  }) => {
    await saveSnapshot();
    saveMock.mockResolvedValue(storeResponse(result));
    expect(Object.keys(await cache.save())).toHaveLength(count);
  });

  it('keeps the previous snapshot when no service built with Buildah', async () => {
    const previous = await saveSnapshot();
    const archive = join(root, Object.keys(previous)[0]);
    useDeployment('prebuilt-deployment');
    saveMock.mockResolvedValue(storeResponse({ status: 'unused' }));
    expect(Object.keys(await cache.save())).toEqual(Object.keys(previous));
    expect(readFileSync(archive, 'utf8')).toBe('complete snapshot');
  });

  it('leaves a snapshot it did not restore when saving fails', async () => {
    const previous = await saveSnapshot();
    const archive = join(root, Object.keys(previous)[0]);
    useDeployment('failed-deployment');
    saveMock.mockRejectedValue(new Error('ENOSPC: no space left on device'));
    await expect(cache.save()).resolves.toEqual({});
    expect(readFileSync(archive, 'utf8')).toBe('complete snapshot');
  });

  it('rejects a symlinked cache directory without writing outside the checkout', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    mkdirSync(join(root, '.vercel', 'cache'), { recursive: true });
    symlinkSync(outside, snapshotDirectory());
    expect(await cache.save()).toEqual({});
    expect(saveMock).not.toHaveBeenCalled();
    expect(readdirSync(outside)).toEqual([]);
  });

  it('never removes snapshots through a symlinked parent directory', async () => {
    const outside = join(root, 'outside');
    mkdirSync(join(outside, 'buildah-store'), { recursive: true });
    writeFileSync(join(outside, 'buildah-store', 'keep'), 'outside');
    mkdirSync(join(root, '.vercel'));
    symlinkSync(outside, join(root, '.vercel', 'cache'));
    await cache.restore();
    await cache.removeSnapshots();
    expect(restoreMock).not.toHaveBeenCalled();
    expect(readFileSync(join(outside, 'buildah-store', 'keep'), 'utf8')).toBe(
      'outside'
    );
  });

  it('skips the snapshot when flock is unavailable', async () => {
    await saveSnapshot();
    useDeployment('next-deployment');
    __resetFlockAvailability();
    hasCommandMock.mockResolvedValue(false);
    await expect(cache.restore()).resolves.toBeUndefined();
    expect(restoreMock).not.toHaveBeenCalled();
    expect(existsSync(snapshotDirectory())).toBe(false);
    expect(await cache.save()).toEqual({});
  });
});

describe('Buildah store cache lifecycle entry points', () => {
  beforeEach(async () => {
    await saveSnapshot();
  });

  it('restores before a Buildah build and leaves the snapshot for other sources', async () => {
    await cache.beforeBuild({ buildsWithBuildah: false });
    expect(restoreMock).not.toHaveBeenCalled();
    expect(existsSync(snapshotDirectory())).toBe(true);
    useDeployment('next-deployment');
    restoreMock.mockResolvedValue(storeResponse({ status: 'hit', bytes: 17 }));
    await cache.beforeBuild({ buildsWithBuildah: true });
    expect(restoreMock).toHaveBeenCalledOnce();
    expect(existsSync(snapshotDirectory())).toBe(false);
  });

  it.each([
    ['the flag is off', 'VERCEL_BUILDAH_STORE_CACHE'],
    ['there is no deployment ID', 'VERCEL_DEPLOYMENT_ID'],
  ])('removes the snapshot without restoring or saving when %s', async (_case, variable) => {
    vi.stubEnv(variable, '');
    runMock.mockClear();
    await cache.beforeBuild({ buildsWithBuildah: true });
    expect(existsSync(snapshotDirectory())).toBe(false);
    mkdirSync(snapshotDirectory(), { recursive: true });
    await expect(cache.afterBuilds()).resolves.toEqual({});
    expect(existsSync(snapshotDirectory())).toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('leaves the checkout alone outside the build container', async () => {
    vi.stubEnv('VERCEL_BUILD_IMAGE', '');
    runMock.mockClear();
    await cache.beforeBuild({ buildsWithBuildah: true });
    await expect(cache.afterBuilds()).resolves.toEqual({});
    expect(existsSync(snapshotDirectory())).toBe(true);
    expect(runMock).not.toHaveBeenCalled();
  });
});
