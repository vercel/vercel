import chalk from 'chalk';
import { stat } from 'fs/promises';
import { join, dirname } from 'path';
import { pathExists } from 'fs-extra';
import {
  isExperimentalServicesEnabled,
  tryDetectServices,
} from './detect-services';
import output from '../../output-manager';

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

    const hasVercelDir = await pathExists(join(dir, '.vercel'));
    const hasVercelJson = await pathExists(join(dir, 'vercel.json'));
    const hasGit = await pathExists(join(dir, '.git'));

    if (hasVercelDir || hasVercelJson || hasGit) {
      return dir;
    }

    dir = dirname(dir);
  }

  return null;
}

/**
 * Resolve the effective project working directory.
 *
 * When experimental services are enabled (via env var or explicit
 * experimentalServices in vercel.json) and the current directory is inside
 * a service subdirectory, this returns the project root instead so that
 * commands operate on the whole project rather than a single service.
 */
export async function resolveProjectCwd(cwd: string): Promise<string> {
  const projectRoot = await findProjectRoot(cwd);
  if (!projectRoot || projectRoot === cwd) return cwd;

  const isServicesEnabled = await isExperimentalServicesEnabled(projectRoot);
  if (!isServicesEnabled) {
    return cwd;
  }

  const result = await tryDetectServices(projectRoot);
  if (result && result.services.length > 0) {
    output.debug(`Running from project root: ${chalk.cyan(projectRoot)}`);
    return projectRoot;
  }

  return cwd;
}
