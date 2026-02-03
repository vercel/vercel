import { stat } from 'fs/promises';
import { join, dirname } from 'path';
import { pathExists } from 'fs-extra';
import { VERCEL_DIR } from '../projects/link';

/**
 * Find root of a project.
 *
 * Returns the first parent directory that contains a Vercel project marker:
 *  1. .vercel/ directory (project already initialized)
 *  2. vercel.json (explicit project config)
 *  3. .git/ directory
 */
export async function findProjectRoot(
  startDir: string
): Promise<string | null> {
  let cwdDev: number;
  try {
    cwdDev = (await stat(startDir)).dev;
  } catch {
    return null;
  }

  // Start from parent directory, because it may be a service
  // dir with its own .vercel/ (e.g. with Python shims)
  let dir = dirname(startDir);

  while (dirname(dir) !== dir) {
    // Stop at FS boundary
    try {
      if ((await stat(dir)).dev !== cwdDev) {
        return null;
      }
    } catch {
      return null;
    }

    const hasVercelDir = await pathExists(join(dir, VERCEL_DIR));
    const hasVercelJson = await pathExists(join(dir, 'vercel.json'));
    const hasGit = await pathExists(join(dir, '.git'));

    if (hasVercelDir || hasVercelJson || hasGit) {
      return dir;
    }

    dir = dirname(dir);
  }

  return null;
}
