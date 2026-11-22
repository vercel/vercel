import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeRuntime, runtimes } from '@vercel/fun';
import { isErrnoException } from '@vercel/error-utils';

const LAUNCHERS = ['bootstrap', 'executable'];

/**
 * Copies a `fun` runtime to its cache directory and makes its launchers
 * executable. `fun` copies the mode of each runtime file, and the native
 * binary reports every embedded file as 0644, so without this `fun` cannot
 * spawn the launcher.
 */
export async function initializeFunRuntime(name: string): Promise<void> {
  const runtime = runtimes[name];
  if (!runtime) {
    return;
  }
  const { cacheDir } = await initializeRuntime(runtime);
  if (!cacheDir) {
    return;
  }
  for (const launcher of LAUNCHERS) {
    try {
      await chmod(join(cacheDir, launcher), 0o755);
    } catch (err) {
      if (!isErrnoException(err) || err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
