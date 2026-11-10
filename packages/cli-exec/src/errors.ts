import { stat } from 'node:fs/promises';
import type { ResolutionDiagnostics } from './diagnostics';
import type { VercelCliErrorCode, VercelCliInvocation } from './types';

/**
 * Error returned when CLI resolution or execution fails.
 *
 * `code` is always set. The remaining fields are populated when the failure
 * happened after a CLI invocation was resolved or started.
 */
export class VercelCliError extends Error {
  /**
   * Stable machine-readable error code.
   */
  code: VercelCliErrorCode;

  /**
   * Resolved CLI command and arguments, when available.
   */
  invocation?: VercelCliInvocation;

  /**
   * Captured standard output from the failed process, when available.
   */
  stdout?: string;

  /**
   * Captured standard error from the failed process, when available.
   */
  stderr?: string;

  /**
   * Process exit code for non-zero exits, when available.
   */
  exitCode?: number;

  constructor(options: {
    code: VercelCliErrorCode;
    message: string;
    invocation?: VercelCliInvocation;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'VercelCliError';
    this.code = options.code;
    this.invocation = options.invocation;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.exitCode = options.exitCode;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Builds a not-found error message with diagnostics from local bin resolution.
 */
export function getCliNotFoundMessage(
  diagnostics: ResolutionDiagnostics
): string {
  const details: string[] = [];
  const { localBinSearch } = diagnostics;

  if (localBinSearch.stopReason === 'project-root-marker') {
    details.push(
      `Local bin lookup stopped at ${JSON.stringify(localBinSearch.stoppedAt)} (${JSON.stringify(localBinSearch.markerPath)}).`
    );
  } else if (localBinSearch.stopReason === 'filesystem-root') {
    details.push(
      `No project root marker was found from ${JSON.stringify(localBinSearch.searchRoot)}; local bin lookup reached the filesystem root.`
    );
  }

  for (const skippedNodeModules of localBinSearch.skippedNodeModules) {
    details.push(
      `Skipped ${JSON.stringify(skippedNodeModules.directory)}: ${skippedNodeModules.reason}.`
    );
  }

  for (const skippedLocalBin of diagnostics.skippedLocalBins) {
    details.push(
      `Skipped ${JSON.stringify(skippedLocalBin.candidate)}: ${skippedLocalBin.reason}.`
    );
  }

  if (details.length === 0) {
    return 'Unable to find a usable Vercel CLI installation.';
  }

  return ['Unable to find a usable Vercel CLI installation.', ...details].join(
    '\n'
  );
}

/**
 * Verifies that the resolved working directory exists and is a directory.
 */
export async function assertValidCwd(cwd: string) {
  try {
    if (!(await stat(cwd)).isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    throw new VercelCliError({
      code: 'VERCEL_CLI_INVALID_CWD',
      message: `Working directory ${JSON.stringify(cwd)} does not exist or is not a directory.`,
    });
  }
}

/**
 * Converts errors from `execa` into stable `VercelCliError` instances.
 */
export function toVercelCliError(
  invocation: VercelCliInvocation,
  error: unknown
): VercelCliError {
  if (typeof error === 'object' && error !== null) {
    const execaError = error as {
      code?: string;
      exitCode?: number;
      timedOut?: boolean;
      isCanceled?: boolean;
      signal?: string | null;
      stdout?: string;
      stderr?: string;
      shortMessage?: string;
      message?: string;
    };

    if (execaError.code === 'ENOENT') {
      return new VercelCliError({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: `Unable to find Vercel CLI command ${JSON.stringify(invocation.command)}.`,
        invocation,
        cause: error,
      });
    }

    if (execaError.code === 'EACCES' || execaError.code === 'EPERM') {
      return new VercelCliError({
        code: 'VERCEL_CLI_PERMISSION_DENIED',
        message: `Permission denied while executing Vercel CLI command ${JSON.stringify(invocation.command)}.`,
        invocation,
        cause: error,
      });
    }

    if (execaError.timedOut) {
      return new VercelCliError({
        code: 'VERCEL_CLI_TIMED_OUT',
        message: `Timed out while executing Vercel CLI command ${JSON.stringify(invocation.command)}.`,
        invocation,
        stdout: execaError.stdout,
        stderr: execaError.stderr,
        cause: error,
      });
    }

    if (execaError.isCanceled) {
      return new VercelCliError({
        code: 'VERCEL_CLI_CANCELED',
        message: `Canceled while executing Vercel CLI command ${JSON.stringify(invocation.command)}.`,
        invocation,
        stdout: execaError.stdout,
        stderr: execaError.stderr,
        cause: error,
      });
    }

    if (execaError.signal) {
      return new VercelCliError({
        code: 'VERCEL_CLI_SIGNALED',
        message: `Vercel CLI command ${JSON.stringify(invocation.command)} exited due to signal ${execaError.signal}.`,
        invocation,
        stdout: execaError.stdout,
        stderr: execaError.stderr,
        cause: error,
      });
    }

    if (typeof execaError.exitCode === 'number') {
      return new VercelCliError({
        code: 'VERCEL_CLI_ERRORED',
        message:
          execaError.shortMessage ??
          execaError.message ??
          `Vercel CLI command ${JSON.stringify(invocation.command)} exited with code ${execaError.exitCode}.`,
        invocation,
        stdout: execaError.stdout,
        stderr: execaError.stderr,
        exitCode: execaError.exitCode,
        cause: error,
      });
    }
  }

  return new VercelCliError({
    code: 'VERCEL_CLI_EXEC_FAILED',
    message: `Could not execute Vercel CLI command ${JSON.stringify(invocation.command)}.`,
    invocation,
    cause: error,
  });
}
