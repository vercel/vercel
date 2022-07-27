import semver from 'semver';
import XDGAppPaths from 'xdg-app-paths';
import { dirname, join } from 'path';
// import { fileURLToPath } from 'url';
import { outputJSON, readJSON } from 'fs-extra';
import type { PackageJson } from '@vercel/build-utils';
import { spawn } from 'child_process';

interface UpdateNotifierConfig {
  version: string;
  expireAt: number;
  notified: boolean;
}

const xdgDir = XDGAppPaths('com.vercel.cli').cache();
const cacheDir = join(xdgDir, 'update-notifier');

const script = join(dirname(dirname(__filename)), 'dist', 'update-worker.js');
// const script = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist', 'update-worker.js');

/**
 * Determines if it needs to check for a newer CLI version and returns the last
 * detected version. The version could be stale, but still newer than the
 * current version.
 */
export default async function updateNotifier({
  pkg,
  distTag,
  updateCheckInterval,
  wait,
}: {
  pkg: PackageJson;
  distTag: string;
  updateCheckInterval: number;
  wait?: boolean;
}): Promise<string | undefined> {
  const cacheFile = join(cacheDir, `${pkg.name}-${distTag}.json`);

  let cache: UpdateNotifierConfig | undefined;
  try {
    cache = await readJSON(cacheFile);
  } catch (e: any) {
    // cache does not exist or malformed
  }

  if (!cache || cache.expireAt < Date.now()) {
    await new Promise<void>(resolve => {
      // spawn the worker, wait for the worker to report it's ready, then
      // signal the worker to fetch the latest version
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
