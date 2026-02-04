import { execSync } from 'node:child_process';
import { join } from 'node:path';

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
function getGitDirectory(opts: GitExecOptions): string | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return gitDir.trim();
  } catch (error) {
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Retrieves the root directory of the Git repository.
 *
 * This function uses `git rev-parse --show-toplevel` to find the root of the
 * Git repository. This works correctly for regular repositories, worktrees,
 * and submodules.
 *
 * @param {GitExecOptions} opts - The options for executing the Git command.
 * @returns {string | null} The path to the Git repository root if found; otherwise, null.
 * If `opts.unsafe` is set to true and an error occurs, the function will throw
 * an error instead of returning null.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
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
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Retrieves the common Git directory for the specified working directory.
 *
 * In a regular Git repository, this is the same as the git directory (.git).
 * In a worktree, this returns the path to the main repository's .git directory
 * where shared files like config, objects, and refs are stored.
 *
 * @param {GitExecOptions} opts - The options for executing the Git command.
 * @returns {string | null} The path to the common Git directory if found; otherwise, null.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
function getGitCommonDirectory(opts: GitExecOptions): string | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return gitCommonDir.trim();
  } catch (error) {
    if (unsafe) {
      throw error;
    }

    return null;
  }
}

/**
 * Gets the path to the Git config file.
 *
 * In a regular Git repository, this returns `<repo-root>/.git/config`.
 * In a worktree, this returns the config path in the main repository's
 * .git directory (the "common" directory) since config is shared.
 * In a submodule, this returns the config path within the submodule's
 * git directory.
 *
 * @param {GitExecOptions} opts - The options for executing the Git command.
 * @returns {string | null} The path to the Git config file if found; otherwise, null.
 * If `opts.unsafe` is set to true and an error occurs, the function will throw
 * an error instead of returning null.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export function getGitConfigPath(opts: GitExecOptions): string | null {
  // Use git-common-dir to get the path where config is stored.
  // In worktrees, the config is shared with the main repository.
  const gitCommonDir = getGitCommonDirectory(opts);

  if (gitCommonDir === null) {
    return null;
  }

  return join(gitCommonDir, 'config');
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
