import fs from 'fs-extra';
import sleep from '../../../src/util/sleep';
import tmp from 'tmp-promise';
import getLatestVersion from '../../../src/util/get-latest-version';
import { join } from 'path';

tmp.setGracefulCleanup();

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
    expect(typeof cache.version).toEqual('string');
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notified).toEqual(false);

    // 2. call again and this time it'll return the version from the cache
    latest = getLatestVersion({
      cacheDir,
      pkg,
    });
    expect(typeof latest).toBe('string');
    expect(latest).toEqual(expect.stringMatching(versionRE));

    cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notified).toEqual(true);

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
});

async function waitForCacheFile() {
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    if (await fs.pathExists(cacheFile)) {
      return;
    }
  }
}
