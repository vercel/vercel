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

const cacheDir = tmp.tmpNameSync({
  prefix: 'test-vercel-cli-get-latest-version-',
});

const cacheFile = join(cacheDir, 'package-updates', 'vercel-latest.json');

const pkg = {
  name: 'vercel',
  version: '27.3.0',
};

const versionRE = /^\d+\.\d+\.\d+$/;

describe('get latest version', () => {
  afterEach(() => fs.remove(cacheDir));

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

  // this test is too flakey in its current form
  // biome-ignore lint/suspicious/noSkippedTests: temporarily disabled
  it.skip('should not check twice', async () => {
    // 1. first call, no cache file
    let latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg,
    });
    expect(latest).toEqual(undefined);

    // 2. immediately call again, but should hopefully still be undefined
    latest = getLatestVersion({
      cacheDir,
      updateCheckInterval: 1,
      pkg,
    });
    expect(latest).toEqual(undefined);

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

async function waitForCacheFile() {
  const seconds = 20;
  for (let i = 0; i < seconds * 4; i++) {
    await sleep(250);
    if (await fs.pathExists(cacheFile)) {
      return;
    }
  }
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
