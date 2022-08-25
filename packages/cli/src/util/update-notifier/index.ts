import semver from 'semver';
import XDGAppPaths from 'xdg-app-paths';
import { dirname, parse as parsePath, resolve as resolvePath } from 'path';
import type { Output } from '../output';
import { outputJSON, pathExists, readJSON } from 'fs-extra';
import type { PackageJson } from '@vercel/build-utils';
import { spawn } from 'child_process';

interface UpdateNotifierConfig {
  version: string;
  expireAt: number;
  notified: boolean;
}

/**
 * Determines if it needs to check for a newer CLI version and returns the last
 * detected version. The version could be stale, but still newer than the
 * current version.
 *
 * @returns {String|undefined} If a newer version is found, then the lastest
 * version, otherwise `undefined`.
 */
export default async function updateNotifier({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
  distTag = 'latest',
  output,
  pkg,
  updateCheckInterval = 1000 * 60 * 60 * 24 * 7, // 1 week
  wait,
}: {
  cacheDir?: string;
  distTag?: string;
  output?: Output;
  pkg: PackageJson;
  updateCheckInterval?: number;
  wait?: boolean;
}): Promise<string | undefined> {
  const cacheFile = resolvePath(
    cacheDir,
    'update-notifier',
    `${pkg.name}-${distTag}.json`
  );

  const loadCache = async (): Promise<UpdateNotifierConfig | undefined> => {
    try {
      return await readJSON(cacheFile);
    } catch (err: any) {
      // cache does not exist or malformed
      if (err.code !== 'ENOENT') {
        output?.debug(`Error reading update cache file: ${err}`);
      }
    }
  };

  let cache = await loadCache();

  if (!cache || cache.expireAt < Date.now()) {
    await new Promise<void>(async resolve => {
      // spawn the worker, wait for the worker to report it's ready, then
      // signal the worker to fetch the latest version

      // we need to find the update worker script since the location is
      // different based on production vs tests because
      let dir = dirname(__filename);
      let script = resolvePath(dir, 'dist', 'update-worker.js');
      const { root } = parsePath(dir);
      while (!(await pathExists(script))) {
        dir = dirname(dir);
        if (dir === root) {
          // didn't find it, bail
          output?.debug('Failed to find update worker script!');
          resolve();
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
      const timer = setTimeout(() => {
        worker.kill();
        resolve();
      }, 2000);

      // generally, the parent won't be around long enough to handle a non-zero
      // worker process exit code
      worker.on('close', () => resolve());
      worker.on('error', err => {
        output?.log(`Failed to spawn update worker: ${err.stack}`);
        resolve();
      });

      // wait for the worker to start and notify us it is ready
      worker.once('message', () => {
        clearTimeout(timer);

        // tell the worker to check the latest version
        worker.send({
          cacheFile,
          distTag,
          name: pkg.name,
          updateCheckInterval,
          wait,
        });

        if (!wait) {
          worker.unref();
          resolve();
        }
      });
    });

    if (wait) {
      // if we waited, might as well reload the cache with the latest version
      cache = await loadCache();
    }
  }

  if (
    cache &&
    !cache.notified &&
    pkg.version &&
    semver.lt(pkg.version, cache.version)
  ) {
    cache.notified = true;
    await outputJSON(cacheFile, cache);
    return cache.version;
  }
}
