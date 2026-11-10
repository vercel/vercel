import path from 'node:path';
import execa from 'execa';
import { getEnvPath, prependPathEntries, setEnvPath } from './envpath';
import {
  assertValidCwd,
  getCliNotFoundMessage,
  toVercelCliError,
  VercelCliError,
} from './errors';
import {
  clearCachedCliInvocation,
  getLocalBinSearch,
  resolveCachedCliInvocation,
  toVercelCliInvocation,
} from './lookup';
import type {
  ExecVercelCliOptions,
  ExecVercelCliResult,
  VercelCliInvocation,
} from './types';

/**
 * Execa option subset extended for runtime options missing from its v5 types.
 */
type ExecaOptions = execa.Options & {
  signal?: AbortSignal;
  windowsHide?: boolean;
};

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
  await assertValidCwd(cwd);
  const env = mergeExecEnv(options.env);
  const pathValue = getEnvPath(env);

  try {
    return await execResolvedVercelCli(args, options, cwd, env, pathValue);
  } catch (error) {
    if (
      error instanceof VercelCliError &&
      error.code === 'VERCEL_CLI_NOT_FOUND'
    ) {
      clearCachedCliInvocation(cwd, pathValue);
      return await execResolvedVercelCli(args, options, cwd, env, pathValue);
    }

    throw error;
  }
}

/**
 * Resolves one CLI invocation and executes it once.
 */
async function execResolvedVercelCli(
  args: string[],
  options: ExecVercelCliOptions,
  cwd: string,
  env: NodeJS.ProcessEnv,
  pathValue: string
): Promise<ExecVercelCliResult> {
  const invocation = await resolveInvocationOrThrow(cwd, pathValue);

  try {
    const execaOptions: ExecaOptions = {
      input: options.input,
      stdio: options.stdio,
      stdin: options.stdin,
      stdout: options.stdout,
      stderr: options.stderr,
      timeout: options.timeout,
      cwd,
      env: await prependLocalBinsToEnvPath(cwd, env),
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
    throw toVercelCliError(invocation, error);
  }
}

/**
 * Resolves the cached CLI invocation or throws with resolution diagnostics.
 */
async function resolveInvocationOrThrow(
  cwd: string,
  pathValue: string
): Promise<VercelCliInvocation> {
  const resolution = await resolveCachedCliInvocation(cwd, pathValue);

  if (!resolution.found) {
    throw new VercelCliError({
      code: 'VERCEL_CLI_NOT_FOUND',
      message: getCliNotFoundMessage(resolution.diagnostics),
    });
  }

  return toVercelCliInvocation(resolution);
}

/**
 * Merges a caller-provided environment over the current process environment.
 */
function mergeExecEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env) {
    return process.env;
  }

  return { ...process.env, ...env };
}

/**
 * Adds trusted local bins and the current Node executable directory to PATH.
 */
async function prependLocalBinsToEnvPath(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<NodeJS.ProcessEnv> {
  const localPath = await prependLocalBinsToPath(cwd, getEnvPath(env));

  return setEnvPath(
    env,
    prependPathEntries(localPath, [path.dirname(process.execPath)])
  );
}

/**
 * Prepends trusted local bin directories to a PATH value.
 */
async function prependLocalBinsToPath(
  cwd: string,
  pathValue = ''
): Promise<string> {
  return prependPathEntries(
    pathValue,
    (await getLocalBinSearch(cwd)).directories
  );
}
