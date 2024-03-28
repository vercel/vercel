import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import sleep from '../../../src/util/sleep';
import tmp from 'tmp-promise';
import getLatestVersion from '../../../src/util/get-latest-version';
import { join } from 'path';
import { vi } from 'vitest';

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

  it('should not check twice', async () => {
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
      expireAt: Date.now(),
      notifyAt: Date.now() - 60000,
      version: '28.0.0',
    });

    // 2. get the latest version
    let latest = getLatestVersion({
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

    let cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.version).not.toEqual('28.0.0');
    expect(cache.notifyAt).toEqual(undefined);
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
