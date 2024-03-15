import { execSync } from 'node:child_process';

export type GitExecOptions = Readonly<{
  /** Throw if an error occurs. Defaults to false */
  unsafe?: boolean;
  /** The directory to check. Defaults to `process.cwd()` */
  cwd?: string;
}>;

const DEFAULT_GIT_EXEC_OPTS = {
  unsafe: false,
  cwd: process.cwd(),
} as const;

/**
 * Checks if a given directory is a Git worktree.
 *
 * A Git worktree is a linked working tree, which allows you to have multiple
 * working trees attached to the same repository. This function checks if the
 * specified directory (or the current working directory if none is specified) is a Git worktree by
 * looking for the '.git/worktrees/' path in the Git configuration.
 *
 * @param {GitExecOptions} [opts={}] The options to use. Options include:
 *        - `cwd`: The directory to check. Defaults to `process.cwd()`.
 *        - `unsafe`: If true, throws if an error occurs during execution. Defaults to `false`.
 * @returns {boolean} Returns `true` if the directory is a Git worktree, otherwise `false`.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export function isGitWorktree(opts: GitExecOptions = {}): boolean {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitConfigPath = execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
    });

    return gitConfigPath.includes('.git/worktrees/');
  } catch (error) {
    if (unsafe) {
      throw error;
    }

    return false;
  }
}

/**
 * Checks if the current working directory is part of a Git submodule.
 *
 * A Git submodule is a repository embedded inside another repository. This function
 * checks if the current working directory or the specified directory is part of a
 * Git submodule by looking for the '.git/modules/' path in the Git configuration.
 *
 * @param {GitExecOptions} [opts={}] The options to use. Options include:
 *        - `cwd`: The directory to check. Defaults to `process.cwd()`.
 *        - `unsafe`: If true, throws if an error occurs during execution. Defaults to `false`.
 *
 * @returns {boolean} - Returns `true` if the directory is part of a Git submodule, otherwise `false`.
 *
 * @throws {Error} Can throw an error if `opts.unsafe` is set to `true`
 */
export function isGitSubmodule(opts: GitExecOptions = {}): boolean {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitConfigPath = execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
    });

    return gitConfigPath.includes('.git/modules/');
  } catch (error) {
    if (unsafe) {
      throw error;
    }

    return false;
  }
}
