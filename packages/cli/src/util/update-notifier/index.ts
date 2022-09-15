import semver from 'semver';
import XDGAppPaths from 'xdg-app-paths';
import { dirname, parse as parsePath, resolve as resolvePath } from 'path';
import type { Output } from '../output';
import { existsSync, outputJSONSync, readJSONSync } from 'fs-extra';
import type { PackageJson } from '@vercel/build-utils';
import { spawn } from 'child_process';

interface UpdateNotifierConfig {
  version: string;
  expireAt: number;
  notified: boolean;
}

interface UpdateWorkerPayload {
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
export default function updateNotifier({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
  distTag = 'latest',
  output,
  pkg,
  updateCheckInterval,
}: {
  cacheDir?: string;
  distTag?: string;
  output?: Output;
  pkg: PackageJson;
  updateCheckInterval?: number;
}): string | undefined {
  const cacheFile = resolvePath(
    cacheDir,
    'update-notifier',
    `${pkg.name}-${distTag}.json`
  );

  let cache: UpdateNotifierConfig | undefined;
  try {
    cache = readJSONSync(cacheFile);
  } catch (err: any) {
    // cache does not exist or malformed
    if (err.code !== 'ENOENT') {
      output?.debug(`Error reading update cache file: ${err}`);
    }
  }

  if (!cache || cache.expireAt < Date.now()) {
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

  if (
    cache &&
    !cache.notified &&
    pkg.version &&
    semver.lt(pkg.version, cache.version)
  ) {
    cache.notified = true;
    outputJSONSync(cacheFile, cache);
    return cache.version;
  }
}

/**
 * Spawn the worker, wait for the worker to report it's ready, then signal the
 * worker to fetch the latest version.
 */
function spawnWorker(payload: UpdateWorkerPayload, output: Output | undefined) {
  // we need to find the update worker script since the location is
  // different based on production vs tests
  let dir = dirname(__filename);
  let script = resolvePath(dir, 'dist', 'update-worker.js');
  const { root } = parsePath(dir);
  while (!existsSync(script)) {
    dir = dirname(dir);
    if (dir === root) {
      // didn't find it, bail
      output?.debug('Failed to find update worker script!');
      return;
    }
    script = resolvePath(dir, 'dist', 'update-worker.js');
  }

  // spawn the worker with an IPC channel
  output?.debug(`Spawning ${script}`);
  const worker = spawn(process.execPath, [script], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });

  // we allow the child 2 seconds to let us know it's ready before we give up
  const workerReadyTimer = setTimeout(() => worker.kill(), 2000);

  // listen for an early on close error, but then we remove it when unref
  const onClose = (code: number) => {
    output?.debug(`Update worker exited (code ${code})`);
  };
  worker.on('close', onClose);

  // generally, the parent won't be around long enough to handle a non-zero
  // worker process exit code
  worker.on('error', err => {
    output?.log(`Failed to spawn update worker: ${err.stack}`);
  });

  // wait for the worker to start and notify us it is ready
  worker.once('message', () => {
    clearTimeout(workerReadyTimer);

    worker.removeListener('close', onClose);
    worker.send(payload);
    worker.unref();
  });
}
