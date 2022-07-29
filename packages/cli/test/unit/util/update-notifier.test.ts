import fs from 'fs-extra';
import sleep from '../../../src/util/sleep';
import tmp from 'tmp-promise';
import updateNotifier from '../../../src/util/update-notifier';
import { join } from 'path';
// import { client } from '../../mocks/client';

tmp.setGracefulCleanup();

const cacheDir = tmp.tmpNameSync({
  prefix: 'test-vercel-cli-update-notifier-',
});

const pkg = {
  name: 'vercel',
  version: '27.3.0',
};

const versionRE = /^\d+\.\d+\.\d+$/;

describe('update notifier', () => {
  afterEach(() => fs.remove(cacheDir));

  it('should find newer version async', async () => {
    // 1. first call, no cache file
    let latest = await updateNotifier({
      cacheDir,
      pkg,
    });
    expect(latest).toEqual(undefined);

    let files: string[] = await waitForFiles(cacheDir);

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual('update-notifier');
    const updateDir = join(cacheDir, 'update-notifier');
    files = await fs.readdir(updateDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(expect.stringMatching(/\.json$/));
    const cacheFile = join(cacheDir, 'update-notifier', files[0]);

    let cache = await fs.readJSON(cacheFile);
    expect(typeof cache).toEqual('object');
    expect(typeof cache.expireAt).toEqual('number');
    expect(typeof cache.version).toEqual('string');
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notified).toEqual(false);

    // 2. call again and this time it'll return the version from the cache
    latest = await updateNotifier({
      cacheDir,
      pkg,
    });
    expect(typeof latest).toBe('string');
    expect(latest).toEqual(expect.stringMatching(versionRE));

    cache = await fs.readJSON(cacheFile);
    expect(cache.version).toEqual(expect.stringMatching(versionRE));
    expect(cache.notified).toEqual(true);

    // 3. notification already done, should skip
    latest = await updateNotifier({
      cacheDir,
      pkg,
    });
    expect(latest).toEqual(undefined);
  });

  it('should find newer version sync', async () => {
    let latest = await updateNotifier({
      cacheDir,
      pkg,
      wait: true,
    });
    expect(typeof latest).toBe('string');
    expect(latest).toEqual(expect.stringMatching(versionRE));
  });

  it('should not find a newer version', async () => {
    // 1. first call, no cache file
    let latest = await updateNotifier({
      cacheDir,
      pkg: {
        ...pkg,
        version: '999.0.0',
      },
      updateCheckInterval: 1,
    });
    expect(latest).toEqual(undefined);

    await waitForFiles(cacheDir);

    // 2. call again and should recheck and still not find a new version
    latest = await updateNotifier({
      cacheDir,
      pkg: {
        ...pkg,
        version: '999.0.0',
      },
      updateCheckInterval: 1,
    });
    expect(latest).toEqual(undefined);
  });
});

async function waitForFiles(cacheDir: string): Promise<string[]> {
  let files: string[] = [];
  while (!files.length) {
    await sleep(100);
    try {
      files = await fs.readdir(cacheDir);
    } catch (e) {
      // cacheDir may not have been created yet
    }
  }
  return files;
}
