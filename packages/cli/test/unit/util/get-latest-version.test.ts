import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'fs-extra';
import sleep from '../../../src/util/sleep';
// @ts-expect-error Missing types for package
import tmp from 'tmp-promise';
import getLatestVersion, {
  fetchLatestVersion,
  updateLatestVersionCache,
} from '../../../src/util/get-latest-version';
import { join } from 'path';
import { fetchDistTags } from '../../../src/util/get-latest-version/fetch-dist-tags.cjs';

tmp.setGracefulCleanup();

vi.setConfig({ testTimeout: 25000 });

// A fresh cache dir per test: `getLatestVersion()` spawns an unref'd worker
// that can still be writing the cache file after the test that spawned it has
// finished, so sharing one dir across tests lets a leftover worker rewrite (or
// re-create) the cache file underneath a later test.
let cacheDir: string;
let cacheFile: string;

beforeEach(() => {
  cacheDir = tmp.tmpNameSync({
    prefix: 'test-vercel-cli-get-latest-version-',
  });
  cacheFile = join(cacheDir, 'package-updates', 'vercel-latest.json');
});

afterEach(() => fs.remove(cacheDir));

const pkg = {
  name: 'vercel',
  version: '27.3.0',
};

const versionRE = /^\d+\.\d+\.\d+$/;

describe('get latest version', () => {
  it('should find newer version async', async () => {
    // 1. first call, no cache file
    let latest = getLatestVersion({
      cacheDir,
      pkg,
    });
    expect(latest).toEqual(undefined);

    await waitForCacheFile();

    let cache = await fs.readJSON(cacheFile);
    expect(typeof cache).toEqual('object');
    expect(typeof cache.expireAt).toEqual('number');
    expect(cache.expireAt).toBeGreaterThan(Date.now());
    expect(typeof cache.version).toEqual('string');
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notifyAt).toEqual(undefined);

    // 2. call again and this time it'll return the version from the cache
    latest = getLatestVersion({
      cacheDir,
      pkg,
    });
    expect(typeof latest).toBe('string');
    expect(latest).toEqual(expect.stringMatching(versionRE));

    cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notifyAt).not.toEqual(undefined);

    // 3. notification already done, should skip
    latest = getLatestVersion({
      cacheDir,
      pkg,
    });
    expect(latest).toEqual(undefined);
  });

  it('should not find a newer version', async () => {
    // 1. first call, no cache file
    let latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg: {
        ...pkg,
        version: '999.0.0',
      },
    });
    expect(latest).toEqual(undefined);

    await waitForCacheFile();

    // 2. call again and should recheck and still not find a new version
    latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg: {
        ...pkg,
        version: '999.0.0',
      },
    });
    expect(latest).toEqual(undefined);
  });

  it('should not check twice', async () => {
    // 1. first call, no cache file
    let latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg,
    });
    expect(latest).toEqual(undefined);

    // 2. immediately call again; there is still no cache file to read, so this
    //    call cannot notify either. Both calls are synchronous and run in the
    //    same tick, so no worker can have written the cache file in between.
    latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg,
    });
    expect(latest).toEqual(undefined);

    // Both calls raced a worker of their own, so wait until the cache file has
    // settled — not merely until it exists — before reading it below.
    await waitForCacheFile();

    // 3. call again and should recheck and find a new version
    latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg,
    });
    expect(typeof latest).toBe('string');
    expect(latest).toEqual(expect.stringMatching(versionRE));
  });

  it('should error if no arguments are passed in', () => {
    expect(() => getLatestVersion(undefined as any)).toThrow(TypeError);
  });

  it('should error package is invalid', () => {
    expect(() => getLatestVersion({} as any)).toThrow(TypeError);
    expect(() => getLatestVersion({ pkg: null as any })).toThrow(TypeError);
    expect(() => getLatestVersion({ pkg: {} })).toThrow(TypeError);
    expect(() => getLatestVersion({ pkg: { name: null as any } })).toThrow(
      TypeError
    );
    expect(() => getLatestVersion({ pkg: { name: '' } })).toThrow(TypeError);
  });

  // A worker writes the cache file non-atomically, so a caller can catch it
  // truncated or half-written. That must degrade to "no notification" instead of
  // throwing at the user.
  it.each([
    ['a truncated (mid-write) cache file', ''],
    ['a partially written cache file', '{"expireAt":178672299'],
    ['a malformed cache file', 'not json'],
  ])('should treat %s as a cache miss', async (_name, contents) => {
    await fs.outputFile(cacheFile, contents);

    let latest: string | undefined;
    expect(() => {
      latest = getLatestVersion({ cacheDir, pkg });
    }).not.toThrow();
    expect(latest).toEqual(undefined);
  });

  it('should reset notify if newer version is available', async () => {
    // 1. seed the cache file with both a expireAt and notifyAt in the future
    //    with an out-of-date latest version
    await fs.mkdirs(join(cacheDir, 'package-updates'));
    await fs.writeJSON(cacheFile, {
      expireAt: Date.now() - 10000,
      notifyAt: Date.now() - 60000,
      version: '28.0.0',
    });

    // 2. get the latest version
    const latest = getLatestVersion({
      cacheDir,
      pkg,
    });
    expect(latest).toEqual('28.0.0');

    // we need to wait up to 20 seconds for the cacheFile to be updated
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      try {
        const cache = await fs.readJSON(cacheFile);
        if (cache.version !== '28.0.0') {
          break;
        }
      } catch {
        // cacheFile has not been updated yet
      }
      if (i + 1 === 80) {
        throw new Error(`Timed out waiting for worker to fetch latest version`);
      }
    }

    const cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.version).not.toEqual('28.0.0');
    expect(cache.notifyAt).toEqual(undefined);
  });

  it('should not consume notification when consumeNotification is false', async () => {
    // 1. seed the cache file with an expired cache and past notifyAt
    await fs.mkdirs(join(cacheDir, 'package-updates'));
    const originalNotifyAt = Date.now() - 60000;
    await fs.writeJSON(cacheFile, {
      expireAt: Date.now() + 10000,
      notifyAt: originalNotifyAt,
      version: '28.0.0',
    });

    // 2. call with consumeNotification: false — should return the version
    //    but NOT write notifyAt
    const latest = getLatestVersion({
      cacheDir,
      pkg,
      consumeNotification: false,
    });
    expect(latest).toEqual('28.0.0');

    // 3. verify notifyAt was NOT written
    const cache = await fs.readJSON(cacheFile);
    expect(cache.notifyAt).toEqual(originalNotifyAt);

    // 4. call again with default (consumeNotification: true) — should
    //    now write notifyAt
    getLatestVersion({ cacheDir, pkg });
    const cacheAfterConsume = await fs.readJSON(cacheFile);
    expect(cacheAfterConsume.notifyAt).not.toEqual(originalNotifyAt);
    expect(cacheAfterConsume.notifyAt).toBeGreaterThan(Date.now());
  });
});

describe('updateLatestVersionCache', () => {
  it('writes the version to the cache file with a future expiry', async () => {
    await fs.mkdirs(join(cacheDir, 'package-updates'));

    updateLatestVersionCache({
      cacheDir,
      name: 'vercel',
      version: '54.14.0',
    });

    const cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual('54.14.0');
    expect(cache.expireAt).toBeGreaterThan(Date.now());
  });

  it('preserves notifyAt from the existing cache', async () => {
    await fs.mkdirs(join(cacheDir, 'package-updates'));
    const existingNotifyAt = Date.now() + 100000;
    await fs.writeJSON(cacheFile, {
      expireAt: Date.now() - 1000,
      notifyAt: existingNotifyAt,
      version: '54.2.0',
    });

    updateLatestVersionCache({
      cacheDir,
      name: 'vercel',
      version: '54.14.0',
    });

    const cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual('54.14.0');
    expect(cache.notifyAt).toEqual(existingNotifyAt);
  });

  it('works when no cache file exists yet', async () => {
    updateLatestVersionCache({
      cacheDir,
      name: 'vercel',
      version: '54.14.0',
    });

    const cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual('54.14.0');
    expect(cache.expireAt).toBeGreaterThan(Date.now());
  });
});

/**
 * Waits until the background worker has finished writing the cache file.
 *
 * Waiting for the file to merely _exist_ is not enough. The worker writes the
 * cache file with a non-atomic `writeFile()` (truncate, then write), and when
 * two `getLatestVersion()` calls race, both spawn a worker and both workers
 * write the same file milliseconds apart. A read that lands in either write
 * window sees an empty or partial file, and `getLatestVersion()` treats an
 * unparsable cache file as a cache miss and returns `undefined` — which is what
 * made these tests flaky.
 *
 * So instead of checking for existence, poll until the file parses, contains a
 * version, and has stopped changing, and fail loudly if that never happens
 * (rather than returning silently and leaving the caller to assert on a value
 * that was never going to arrive).
 */
async function waitForCacheFile() {
  const interval = 250;
  const timeout = 20000;
  const attempts = timeout / interval;
  let previous: string | undefined;

  for (let i = 0; i < attempts; i++) {
    await sleep(interval);

    let current: string;
    try {
      current = await fs.readFile(cacheFile, 'utf-8');
    } catch {
      // the worker has not created the cache file yet
      continue;
    }

    let version: string | undefined;
    try {
      version = JSON.parse(current).version;
    } catch {
      // the file is mid-write, so any previous read is not trustworthy either
      previous = undefined;
      continue;
    }

    // two identical consecutive reads mean no worker is still writing, so the
    // file cannot be truncated out from under the assertions that follow
    if (version && previous === current) {
      return;
    }
    previous = current;
  }

  throw new Error(
    `Timed out after ${timeout}ms waiting for the worker to write the cache file: ${cacheFile}`
  );
}

// Mock fetchDistTags (the dependency of fetchLatestVersion) so we can test
// fetchLatestVersion's logic without hitting the network.
vi.mock('../../../src/util/get-latest-version/fetch-dist-tags.cjs', () => ({
  fetchDistTags: vi.fn(),
}));

describe('fetchLatestVersion', () => {
  const fetchDistTagsMock = vi.mocked(fetchDistTags);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the latest version on a successful response', async () => {
    fetchDistTagsMock.mockResolvedValue({ latest: '54.14.0' });

    const version = await fetchLatestVersion({ name: 'vercel', timeout: 1000 });
    expect(version).toEqual('54.14.0');
  });

  it('should return undefined when fetchDistTags fails', async () => {
    fetchDistTagsMock.mockResolvedValue(undefined);

    const version = await fetchLatestVersion({ name: 'vercel', timeout: 1000 });
    expect(version).toEqual(undefined);
  });

  it('should return undefined when dist-tag is not found', async () => {
    fetchDistTagsMock.mockResolvedValue({ beta: '54.0.0-beta.1' });

    const version = await fetchLatestVersion({ name: 'vercel', timeout: 1000 });
    expect(version).toEqual(undefined);
  });

  it('should support a custom dist-tag', async () => {
    fetchDistTagsMock.mockResolvedValue({
      latest: '54.14.0',
      canary: '54.15.0-canary.0',
    });

    const version = await fetchLatestVersion({
      name: 'vercel',
      distTag: 'canary',
      timeout: 1000,
    });
    expect(version).toEqual('54.15.0-canary.0');
  });

  it('should pass timeout and name to fetchDistTags', async () => {
    fetchDistTagsMock.mockResolvedValue({ latest: '1.0.0' });

    await fetchLatestVersion({ name: 'vercel', timeout: 5000 });
    expect(fetchDistTagsMock).toHaveBeenCalledWith('vercel', { timeout: 5000 });
  });

  it('should use default timeout of 3000ms', async () => {
    fetchDistTagsMock.mockResolvedValue({ latest: '1.0.0' });

    await fetchLatestVersion({ name: 'vercel' });
    expect(fetchDistTagsMock).toHaveBeenCalledWith('vercel', { timeout: 3000 });
  });
});
