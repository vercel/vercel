import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { normalize } from 'node:path';
import { errorToString } from '@vercel/error-utils';
import output from '../output-manager';

const execAsync = promisify(exec);

/** Defines the options for executing Git commands */
export type GitExecOptions = Readonly<{
  /** If set to true, the function will throw
   * an error if any occurs during the execution of the Git command. By default,
   * it is set to false, meaning errors are caught and handled gracefully.*/
  unsafe?: boolean;
  /** Specifies the current working directory
   * from which the Git command should be executed.
   */
  cwd: string;
}>;

export type GitRemoteMap = Readonly<Record<string, string>>;

const DEFAULT_GIT_EXEC_OPTS = {
  unsafe: false,
};

/**
 * Attempts to retrieve the Git directory for the specified working directory.
 *
 * This function runs the Git command to find the `.git` directory associated
 * with the current or specified working directory. This is useful for
 * determining if the current working environment is within a Git repository.
 *
 * @param {GitExecOptions} opts - The options for executing the Git command.
 * @returns {Promise<string | null>} The path to the Git directory if found; otherwise, null.
 * If `opts.unsafe` is set to true and an error occurs, the function will throw
 * an error instead of returning null.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export async function getGitDirectory(
  opts: GitExecOptions
): Promise<string | null> {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const { stdout } = await execAsync('git rev-parse --git-dir', { cwd });
    return stdout.trim();
  } catch (error) {
    output.debug(`Failed to get Git directory: ${errorToString(error)}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Returns the absolute path to the root of the Git repository for the given cwd.
 */
export async function getGitRootDirectory(
  opts: GitExecOptions
): Promise<string | null> {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', {
      cwd,
    });
    return normalize(stdout.trim());
  } catch (error) {
    output.debug(`Failed to get Git root directory: ${errorToString(error)}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Returns all Git remotes (fetch URLs) configured for the provided cwd.
 *
 * @returns An object mapping remote names to URLs. Returns `{}` for valid repos
 * with no remotes configured. Returns `null` if not in a git repo or on error.
 */
export async function getGitRemoteUrls(
  opts: GitExecOptions
): Promise<GitRemoteMap | null> {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const { stdout } = await execAsync('git remote -v', { cwd });
    const remotesOutput = stdout.trim();

    if (!remotesOutput) {
      return {};
    }

    const remoteUrls: Record<string, string> = {};
    for (const line of remotesOutput.split('\n')) {
      const remoteLine = line.trim();
      if (!remoteLine) continue;

      // Allow optional annotations like [blob:none] from partial clones
      const match = remoteLine.match(
        /^(\S+)\s+(\S+)\s+\((fetch|push)\)(?:\s+\[.*\])?$/
      );
      if (!match) {
        continue;
      }
      const [, remoteName, remoteUrl, remoteType] = match;

      if (remoteType === 'fetch') {
        remoteUrls[remoteName] = remoteUrl;
      }
    }

    return remoteUrls;
  } catch (error) {
    output.debug(`Failed to get Git remote URLs: ${errorToString(error)}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Returns the URL of the "origin" remote for the given cwd, or null if not found.
 */
export async function getGitOriginUrl(
  opts: GitExecOptions
): Promise<string | null> {
  const remoteUrls = await getGitRemoteUrls(opts);
  return remoteUrls?.['origin'] ?? null;
}
