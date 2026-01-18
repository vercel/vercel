import { execSync } from 'node:child_process';
import output from '../output-manager';

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
 * @returns {string | null} The path to the Git directory if found; otherwise, null.
 * If `opts.unsafe` is set to true and an error occurs, the function will throw
 * an error instead of returning null.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export function getGitDirectory(opts: GitExecOptions): string | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitConfigPath = execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return gitConfigPath.trim();
  } catch (error) {
    output.debug(`Failed to get Git directory: ${error}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Returns the absolute path to the root of the Git repository for the given cwd.
 */
export function getGitRootDirectory(opts: GitExecOptions): string | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return gitRoot.trim();
  } catch (error) {
    output.debug(`Failed to get Git root directory: ${error}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Returns all Git remotes (fetch URLs) configured for the provided cwd.
 */
export function getGitRemoteUrls(opts: GitExecOptions): GitRemoteMap | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const remotesOutput = execSync('git remote -v', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    if (!remotesOutput) {
      return null;
    }

    const remoteUrls: Record<string, string> = {};
    for (const line of remotesOutput.split('\n')) {
      const remoteLine = line.trim();
      if (!remoteLine) continue;

      const match = remoteLine.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) {
        continue;
      }
      const [, remoteName, remoteUrl, remoteType] = match;

      if (remoteType === 'fetch' || !remoteUrls[remoteName]) {
        remoteUrls[remoteName] = remoteUrl;
      }
    }

    return Object.keys(remoteUrls).length ? remoteUrls : null;
  } catch (error) {
    output.debug(`Failed to get Git remote URLs: ${error}`);
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Checks if a given directory is a Git worktree or Git submodule.
 *
 * A Git worktree is a linked working tree, which allows you to have multiple
 * working trees attached to the same repository. This function checks if the
 * specified directory (or the current working directory if none is specified)
 * is a Git worktree by looking for the '.git/worktrees/' path in the Git
 * configuration.
 *
 * A Git submodule is a repository embedded inside another repository. This
 * function checks if the current working directory or the specified directory
 * is part of a Git submodule by looking for the '.git/modules/' path in the
 * Git configuration.
 *
 * @param {GitExecOptions} [opts={}] The options to use. Options include:
 *        - `cwd`: The directory to check. Defaults to `process.cwd()`.
 *        - `unsafe`: If true, throws if an error occurs during execution.
 *        Defaults to `false`.
 * @returns {boolean} Returns `true` if the directory is a Git worktree or Git
 * Submodule, otherwise `false`.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export function isGitWorktreeOrSubmodule(opts: GitExecOptions): boolean {
  const gitDir = getGitDirectory(opts);

  if (gitDir === null) {
    return false;
  }

  const isGitWorktree = gitDir.includes('.git/worktrees/');
  const isGitSubmodule = gitDir.includes('.git/modules/');

  return isGitWorktree || isGitSubmodule;
}
