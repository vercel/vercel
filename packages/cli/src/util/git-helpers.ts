import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { Glob } from 'glob';

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
export function getGitDirectory(opts: GitExecOptions): string | null {
  const { cwd, unsafe } = { ...DEFAULT_GIT_EXEC_OPTS, ...opts };

  try {
    const gitConfigPath = execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return gitConfigPath;
  } catch (error) {
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

/**
 * Reads and returns the glob patterns from a .gitignore file.
 *
 * This function reads the contents of the specified .gitignore file and
 * returns an array of glob patterns defined in it. It handles different
 * end-of-line characters and returns null if the file is empty.
 *
 * @param {string} gitIgnoreFilePath - The path to the .gitignore file to read.
 * @param {Object} [options] - Optional configuration object.
 * @param {boolean} [options.unsafe=true] - If true, throws errors instead of returning null.
 *
 * @returns {ReadonlyArray<string> | null} An array of glob patterns if the file is not empty;
 * otherwise, null. If an error occurs and `options.unsafe` is false, returns null.
 *
 * @throws {Error} Can throw an error if reading the file fails and `options.unsafe` is true or undefined.
 */
export function readGitIgnoreGlobPatterns(
  gitIgnoreFilePath: string,
  options?: Readonly<{ unsafe: boolean }>
): ReadonlyArray<string> | null {
  try {
    const contents = readFileSync(gitIgnoreFilePath, { encoding: 'utf8' });
    const EOL = contents.includes('\r\n') ? '\r\n' : os.EOL;

    if (contents.length === 0) {
      return null;
    }

    const patterns = contents.split(EOL);

    return patterns;
  } catch (error) {
    if (options?.unsafe === true || options === undefined) {
      throw error;
    }

    return null;
  }
}

/**
 * Checks if a given file is included in the glob patterns defined in a .gitignore file.
 *
 * This function reads the glob patterns from the specified .gitignore file and
 * checks if the given file name matches any of these patterns.
 *
 * @param {string} fileName - The name of the file to check.
 * @param {string} gitignorePath - The path to the .gitignore file to use for checking.
 *
 * @returns {boolean} Returns true if the file matches any pattern in the .gitignore file,
 * false otherwise. If an error occurs during execution, it returns false.
 */
export function gitIgnoreIncludesFile(
  fileName: string,
  gitignorePath: string
): boolean {
  try {
    const globs = readGitIgnoreGlobPatterns(gitignorePath);

    if (globs === null) {
      return false;
    }

    return (
      globs.find(pattern => {
        return new Glob(pattern).minimatch.match(fileName);
      }) !== undefined
    );
  } catch (error) {
    // ignore errors since this is non-critical
  }
  return false;
}
