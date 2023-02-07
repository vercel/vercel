import semver from 'semver';
import XDGAppPaths from 'xdg-app-paths';
import { dirname, parse as parsePath, resolve as resolvePath } from 'path';
import type { Output } from '../output';
import { existsSync, outputJSONSync, readJSONSync } from 'fs-extra';
import type { PackageJson } from '@vercel/build-utils';
import { spawn } from 'child_process';

interface GetLatestVersionOptions {
  cacheDir?: string;
  distTag?: string;
  notifyInterval?: number;
  output?: Output;
  pkg: PackageJson;
  updateCheckInterval?: number;
}

interface PackageInfoCache {
  expireAt: number;
  notifyAt: number;
  version: string;
}

interface GetLatestWorkerPayload {
  cacheFile?: string;
  distTag?: string;
  name?: string;
  updateCheckInterval?: number;
}

/**
 * Determines if it needs to check for a newer CLI version and returns the last
 * detected version. The version could be stale, but still newer than the
 * current version.
 *
 * @returns {String|undefined} If a newer version is found, then the lastest
 * version, otherwise `undefined`.
 */
export default function getLatestVersion({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
  distTag = 'latest',
  notifyInterval = 1000 * 60 * 60 * 24 * 3, // 3 days
  output,
  pkg,
  updateCheckInterval = 1000 * 60 * 60 * 24, // 1 day
}: GetLatestVersionOptions): string | undefined {
  if (
    !pkg ||
    typeof pkg !== 'object' ||
    !pkg.name ||
    typeof pkg.name !== 'string'
  ) {
    throw new TypeError('Expected package to be an object with a package name');
  }

  const cacheFile = resolvePath(
    cacheDir,
    'package-updates',
    `${pkg.name}-${distTag}.json`
  );

  let cache: PackageInfoCache | undefined;
  try {
    cache = readJSONSync(cacheFile);
  } catch (err: any) {
    // cache does not exist or malformed
    if (err.code !== 'ENOENT') {
      output?.debug(`Error reading latest package cache file: ${err}`);
    }
  }

  if (!cache || !cache.expireAt || cache.expireAt < Date.now()) {
    spawnWorker(
      {
        cacheFile,
        distTag,
        name: pkg.name,
        updateCheckInterval,
      },
      output
    );
  }

  if (cache) {
    const shouldNotify = !cache.notifyAt || cache.notifyAt < Date.now();

    let updateAvailable = false;
    if (cache.version && pkg.version) {
      updateAvailable = semver.lt(pkg.version, cache.version);
    }

    if (shouldNotify && updateAvailable) {
      cache.notifyAt = Date.now() + notifyInterval;
      outputJSONSync(cacheFile, cache);
      return cache.version;
    }
  }
}

/**
 * Spawn the worker, wait for the worker to report it's ready, then signal the
 * worker to fetch the latest version.
 */
function spawnWorker(
  payload: GetLatestWorkerPayload,
  output: Output | undefined
) {
  // we need to find the update worker script since the location is
  // different based on production vs tests
  let dir = dirname(__filename);
  let script = resolvePath(dir, 'dist', 'get-latest-worker.js');
  const { root } = parsePath(dir);
  while (!existsSync(script)) {
    dir = dirname(dir);
    if (dir === root) {
      // didn't find it, bail
      output?.debug('Failed to find the get latest worker script!');
      return;
    }
    script = resolvePath(dir, 'dist', 'get-latest-worker.js');
  }

  // spawn the worker with an IPC channel
  output?.debug(`Spawning ${script}`);
  const args = [script];
  if (output?.debugEnabled) {
    args.push('--debug');
  }
  const worker = spawn(process.execPath, args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });

  // we allow the child 2 seconds to let us know it's ready before we give up
  const workerReadyTimer = setTimeout(() => worker.kill(), 2000);

  // listen for an early on close error, but then we remove it when unref
  const onClose = (code: number) => {
    output?.debug(`Get latest worker exited (code ${code})`);
  };
  worker.on('close', onClose);

  // generally, the parent won't be around long enough to handle a non-zero
  // worker process exit code
  worker.on('error', err => {
    output?.log(`Failed to spawn get latest worker: ${err.stack}`);
  });

  // wait for the worker to start and notify us it is ready
  worker.once('message', () => {
    clearTimeout(workerReadyTimer);

    worker.removeListener('close', onClose);
    worker.send(payload);
    worker.unref();
  });
}
