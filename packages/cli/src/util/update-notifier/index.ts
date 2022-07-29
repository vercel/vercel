import semver from 'semver';
import XDGAppPaths from 'xdg-app-paths';
import { dirname, resolve as resolvePath } from 'path';
// import { fileURLToPath } from 'url';
import { outputJSON, readJSON } from 'fs-extra';
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
 */
export default async function updateNotifier({
  cacheDir = XDGAppPaths('com.vercel.cli').cache(),
  distTag = 'latest',
  pkg,
  updateCheckInterval = 1000 * 60 * 60 * 24 * 7, // 1 week
  wait,
}: {
  cacheDir?: string;
  distTag?: string;
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
    } catch (e: any) {
      // cache does not exist or malformed
    }
  };

  let cache = await loadCache();

  if (!cache || cache.expireAt < Date.now()) {
    await new Promise<void>(resolve => {
      // spawn the worker, wait for the worker to report it's ready, then
      // signal the worker to fetch the latest version

      const script = resolvePath(
        dirname(__filename),
        '..',
        '..',
        '..',
        'dist',
        'update-worker.js'
      );
      // const script = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'update-worker.js');

      const worker = spawn(process.execPath, [script], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      });

      worker.on('close', () => resolve());
      worker.on('error', () => resolve());

      worker.once('message', () => {
        worker.send({
          cacheFile,
          distTag,
          name: pkg.name,
          updateCheckInterval,
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
