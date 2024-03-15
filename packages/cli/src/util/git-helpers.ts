import { execSync } from 'node:child_process';

/**
 * Checks if the current working directory is a Git worktree.
 *
 * A Git worktree is a linked working tree, which allows you to have multiple
 * working trees attached to the same repository. This function checks if the
 * current working directory or the specified directory is a Git worktree by
 * looking for the '.git/worktrees/' path in the Git configuration.
 *
 * @param {string} [cwd] - The current working directory to check. If not specified,
 *                         the process's current working directory is used.
 * @returns {boolean} - Returns `true` if the directory is a Git worktree, otherwise `false`.
 */
export function isGitWorktree(cwd?: string): boolean {
  const gitConfigPath = execSync('git rev-parse --git-dir', {
    cwd,
    encoding: 'utf8',
  });

  return gitConfigPath.includes('.git/worktrees/');
}

/**
 * Checks if the current working directory is part of a Git submodule.
 *
 * A Git submodule is a repository embedded inside another repository. This function
 * checks if the current working directory or the specified directory is part of a
 * Git submodule by looking for the '.git/modules/' path in the Git configuration.
 *
 * @param {string} [cwd] - The current working directory to check. If not specified,
 *                         the process's current working directory is used.
 * @returns {boolean} - Returns `true` if the directory is part of a Git submodule, otherwise `false`.
 */
export function isGitSubmodule(cwd?: string): boolean {
  const gitConfigPath = execSync('git rev-parse --git-dir', {
    cwd,
    encoding: 'utf8',
  });

  return gitConfigPath.includes('.git/modules/');
}
