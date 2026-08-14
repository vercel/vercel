import type execa from 'execa';

/**
 * The resolved executable and arguments needed to invoke the Vercel CLI.
 */
export interface VercelCliInvocation {
  /**
   * Executable command passed to the child process runner.
   */
  command: string;

  /**
   * Arguments prepended before caller-provided CLI arguments.
   */
  commandArgs: string[];

  /**
   * Where the executable was resolved from.
   */
  source: 'local-bin' | 'path';
}

/**
 * Options for executing the resolved Vercel CLI.
 */
export interface ExecVercelCliOptions
  extends Pick<
    execa.Options,
    | 'cwd'
    | 'env'
    | 'input'
    | 'stdio'
    | 'stdin'
    | 'stdout'
    | 'stderr'
    | 'timeout'
  > {
  /**
   * Abort signal used to cancel the child process.
   */
  signal?: AbortSignal;
}

/**
 * Captured output and invocation details from a successful CLI execution.
 */
export interface ExecVercelCliResult {
  /**
   * Captured standard output when execa is configured to pipe stdout.
   */
  stdout?: string;

  /**
   * Captured standard error when execa is configured to pipe stderr.
   */
  stderr?: string;

  /**
   * Resolved command metadata used for the successful invocation.
   */
  invocation: VercelCliInvocation;
}

/**
 * Options for resolving the Vercel CLI without executing it.
 */
export interface FindVercelCliOptions {
  /**
   * Directory where local bin lookup starts. Defaults to `process.cwd()`.
   */
  cwd?: string;

  /**
   * PATH value used after local bin candidates. Defaults to process PATH.
   */
  path?: string;
}

/**
 * Stable error codes produced by {@link VercelCliError}.
 */
export type VercelCliErrorCode =
  | 'VERCEL_CLI_INVALID_CWD'
  | 'VERCEL_CLI_NOT_FOUND'
  | 'VERCEL_CLI_PERMISSION_DENIED'
  | 'VERCEL_CLI_ERRORED'
  | 'VERCEL_CLI_TIMED_OUT'
  | 'VERCEL_CLI_CANCELED'
  | 'VERCEL_CLI_SIGNALED'
  | 'VERCEL_CLI_EXEC_FAILED';
