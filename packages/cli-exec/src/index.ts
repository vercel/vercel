import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import execa from 'execa';

/**
 * The resolved executable and arguments needed to invoke the Vercel CLI.
 */
export interface VercelCliInvocation {
  command: string;
  commandArgs: string[];
  source: 'local-bin' | 'path';
}

/**
 * Options for executing the resolved Vercel CLI.
 */
export interface ExecVercelCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

/**
 * Captured output and invocation details from a successful CLI execution.
 */
export interface ExecVercelCliResult {
  stdout: string;
  stderr: string;
  invocation: VercelCliInvocation;
}

/**
 * Options for resolving the Vercel CLI without executing it.
 */
export interface FindVercelCliOptions {
  cwd?: string;
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
 * Resolves the Vercel CLI from the nearest `node_modules/.bin` directories
 * first, then falls back to the provided `PATH`.
 *
 * Returns `null` when no usable CLI executable can be found.
 */
export function findVercelCli(
  options: FindVercelCliOptions = {}
): VercelCliInvocation | null {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const pathValue = options.path ?? getEnvPath(process.env);
  const cacheKey = getCliInvocationCacheKey(cwd, pathValue);

  if (cliInvocationCache.has(cacheKey)) {
    return cliInvocationCache.get(cacheKey) ?? null;
  }

  const invocation = resolveCliInvocation(cwd, pathValue);

  cliInvocationCache.set(cacheKey, invocation);
  return invocation;
}

/**
 * Clears cached positive and negative CLI resolutions.
 *
 * Call this after installing or removing the CLI in a long-lived process that
 * needs to re-resolve the executable from disk.
 */
export function clearVercelCliCache() {
  cliInvocationCache.clear();
}

/**
 * Resolves and executes the Vercel CLI with the provided arguments.
 *
 * The execution environment is adjusted so local `node_modules/.bin`
 * directories and the current Node executable remain available even when a
 * caller passes a sanitized `PATH`.
 */
export async function execVercelCli(
  args: string[],
  options: ExecVercelCliOptions = {}
): Promise<ExecVercelCliResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  assertValidCwd(cwd);
  const env = mergeExecEnv(options.env);
  const pathValue = getEnvPath(env);
  const cacheKey = getCliInvocationCacheKey(cwd, pathValue);

  for (let attempt = 0; attempt < 2; attempt++) {
    const invocation = findVercelCli({ cwd, path: pathValue });
    if (!invocation) {
      throw new VercelCliError({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: 'Unable to find a usable Vercel CLI installation.',
      });
    }

    try {
      const execaOptions: ExecaOptions = {
        cwd,
        env: prependLocalBinsToEnvPath(cwd, env),
        windowsHide: true,
      };

      if (options.signal) {
        execaOptions.signal = options.signal;
      }

      const { stdout, stderr } = await execa(
        invocation.command,
        [...invocation.commandArgs, ...args],
        execaOptions
      );

      return { stdout, stderr, invocation };
    } catch (error) {
      const wrappedError = toVercelCliError(invocation, error);
      if (wrappedError.code === 'VERCEL_CLI_NOT_FOUND' && attempt === 0) {
        cliInvocationCache.delete(cacheKey);
        continue;
      }

      throw wrappedError;
    }
  }

  throw new VercelCliError({
    code: 'VERCEL_CLI_NOT_FOUND',
    message: 'Unable to find a usable Vercel CLI installation.',
  });
}

interface ResolvedCommand {
  path: string;
  realPath: string;
}

type ExecaOptions = execa.Options & {
  signal?: AbortSignal;
  windowsHide?: boolean;
};

// Cache misses too so repeated calls do not keep rescanning PATH in long-lived
// processes. Callers can clear the cache to force re-resolution after installs.
const cliInvocationCache = new Map<string, VercelCliInvocation | null>();

function getVercelCommandNames(): string[] {
  // Intentionally resolve only the canonical `vercel` binary. `vc` is a
  // convenience alias for interactive use, but callers should not depend on it
  // being present in every installation layout.
  const commandBases = ['vercel'];

  if (process.platform !== 'win32') {
    return commandBases;
  }

  const extensions = ['.cmd', '.exe', ''];
  return commandBases.flatMap(command =>
    extensions.map(extension => `${command}${extension}`)
  );
}

function getAncestorDirectories(cwd: string): string[] {
  const directories = [];
  let current = path.resolve(cwd);

  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
}

function getCanonicalPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

function getLocalBinDirectories(cwd: string): string[] {
  const searchRoot = getCanonicalPath(path.resolve(cwd));

  return getAncestorDirectories(searchRoot).map(directory =>
    path.join(directory, 'node_modules', '.bin')
  );
}

function isNodeScript(filePath: string): boolean {
  return ['.js', '.cjs', '.mjs'].includes(path.extname(filePath));
}

function splitPath(pathValue: string): string[] {
  return pathValue.split(path.delimiter).filter(Boolean);
}

function getEnvPath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform !== 'win32') {
    return env.PATH ?? '';
  }

  const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === 'path');

  for (let index = pathKeys.length - 1; index >= 0; index--) {
    const value = env[pathKeys[index]];
    if (value !== undefined) {
      return value;
    }
  }

  return '';
}

function setEnvPath(
  env: NodeJS.ProcessEnv = process.env,
  pathValue: string
): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') {
    return {
      ...env,
      PATH: pathValue,
    };
  }

  const normalizedEnv = { ...env };

  for (const key of Object.keys(normalizedEnv)) {
    if (key !== 'PATH' && key.toLowerCase() === 'path') {
      delete normalizedEnv[key];
    }
  }

  normalizedEnv.PATH = pathValue;
  return normalizedEnv;
}

function mergeExecEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env) {
    return process.env;
  }

  return { ...process.env, ...env };
}

function findCommandInPath(
  command: string,
  pathValue: string,
  cwd: string
): ResolvedCommand | null {
  for (const directory of splitPath(pathValue)) {
    const candidateDirectory = path.isAbsolute(directory)
      ? directory
      : path.resolve(cwd, directory);
    const candidate = path.join(candidateDirectory, command);
    try {
      accessSync(
        candidate,
        process.platform === 'win32'
          ? constants.F_OK
          : constants.F_OK | constants.X_OK
      );

      if (!statSync(candidate).isFile()) {
        continue;
      }

      return { path: candidate, realPath: realpathSync(candidate) };
    } catch {}
  }

  return null;
}

function getCliInvocationCacheKey(cwd: string, pathValue: string): string {
  return `${cwd}\0${pathValue}`;
}

function isLocalBinPath(cwd: string, filePath: string): boolean {
  const resolvedFilePath = path.resolve(filePath);
  let canonicalFilePath = resolvedFilePath;

  try {
    canonicalFilePath = path.join(
      realpathSync(path.dirname(resolvedFilePath)),
      path.basename(resolvedFilePath)
    );
  } catch {}

  return getLocalBinDirectories(cwd).some(localBinDirectory => {
    try {
      localBinDirectory = realpathSync(localBinDirectory);
    } catch {}
    return canonicalFilePath.startsWith(`${localBinDirectory}${path.sep}`);
  });
}

function prependLocalBinsToPath(cwd: string, pathValue = ''): string {
  return prependPathEntries(pathValue, getLocalBinDirectories(cwd));
}

function prependPathEntries(pathValue: string, directories: string[]): string {
  const pathParts = pathValue.split(path.delimiter).filter(Boolean);
  const prepended: string[] = [];

  for (const directory of directories) {
    if (!pathParts.includes(directory) && !prepended.includes(directory)) {
      prepended.push(directory);
    }
  }

  if (prepended.length === 0) {
    return pathValue;
  }

  return pathValue === '' || pathValue === path.delimiter
    ? `${prepended.join(path.delimiter)}${pathValue}`
    : [...prepended, pathValue].join(path.delimiter);
}

function prependLocalBinsToEnvPath(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const localPath = prependLocalBinsToPath(cwd, getEnvPath(env));

  return setEnvPath(
    env,
    prependPathEntries(localPath, [path.dirname(process.execPath)])
  );
}

function resolveCliInvocation(
  cwd: string,
  pathValue: string
): VercelCliInvocation | null {
  const resolvedPath = prependLocalBinsToPath(cwd, pathValue);

  for (const command of getVercelCommandNames()) {
    const resolvedCommand = findCommandInPath(command, resolvedPath, cwd);
    if (!resolvedCommand) {
      continue;
    }

    const source = isLocalBinPath(cwd, resolvedCommand.path)
      ? 'local-bin'
      : 'path';

    if (isNodeScript(resolvedCommand.realPath)) {
      return {
        command: process.execPath,
        commandArgs: [resolvedCommand.realPath],
        source,
      };
    }

    return {
      command: resolvedCommand.realPath,
      commandArgs: [],
      source,
    };
  }

  return null;
}

function assertValidCwd(cwd: string) {
  try {
    if (!statSync(cwd).isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    throw new VercelCliError({
      code: 'VERCEL_CLI_INVALID_CWD',
      message: `Working directory ${JSON.stringify(cwd)} does not exist or is not a directory.`,
    });
  }
}

function toVercelCliError(
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
