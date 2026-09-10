import { debug, streamToBuffer } from '@vercel/build-utils';
import type { IncomingMessage } from 'http';
import { extname } from 'path';
export {
  getRegExpFromMatchers,
  resolveMiddlewareMatcher,
} from '@vercel/build-utils';

// When exiting this process, wait for Vercel Function server to finish
// all its work, especially waitUntil promises before exiting this process.
//
// Here we use a short timeout (30 seconds) to let the user know that
// it has a long-running waitUntil promise.
export const WAIT_UNTIL_TIMEOUT = 30;

export const waitUntilWarning = (entrypointPath: string, maxDuration: number) =>
  `
The function \`${entrypointPath
    .split('/')
    .pop()}\` is still running after ${maxDuration}s.
(hint: do you have a long-running waitUntil() promise?)
`.trim();

/**
 * If `zeroConfig`:
 *   "api/foo.js" -> "api/foo.js"
 *   "api/foo.ts" -> "api/foo.ts"
 *
 * If *NOT* `zeroConfig`:
 *   "api/foo.js" -> "api/foo"
 *   "api/foo.ts" -> "api/foo"
 */
export function entrypointToOutputPath(
  entrypoint: string,
  zeroConfig?: boolean
): string {
  if (zeroConfig) {
    const ext = extname(entrypoint);
    return entrypoint.slice(0, entrypoint.length - ext.length);
  }
  return entrypoint;
}

export function logError(error: Error) {
  let message = error.message;
  if (!message.startsWith('Error:')) {
    message = `Error: ${message}`;
  }
  console.error(message);

  if (error.stack) {
    // only show the stack trace if debug is enabled
    // because it points to internals, not user code
    const errorPrefixLength = 'Error: '.length;
    const errorMessageLength = errorPrefixLength + error.message.length;
    debug(error.stack.substring(errorMessageLength + 1));
  }
}

export enum EdgeRuntimes {
  Edge = 'edge',
  ExperimentalEdge = 'experimental-edge',
}

export function isEdgeRuntime(runtime?: string): runtime is EdgeRuntimes {
  return (
    runtime !== undefined &&
    Object.values(EdgeRuntimes).includes(runtime as EdgeRuntimes)
  );
}

const ALLOWED_RUNTIMES: string[] = [...Object.values(EdgeRuntimes), 'nodejs'];

export function validateConfiguredRuntime(
  runtime: string | undefined,
  entrypoint: string
) {
  if (runtime) {
    if (!ALLOWED_RUNTIMES.includes(runtime)) {
      throw new Error(
        `${entrypoint}: unsupported "runtime" value in \`config\`: ${JSON.stringify(
          runtime
        )} (must be one of: ${JSON.stringify(
          ALLOWED_RUNTIMES
        )}). Learn more: https://vercel.link/creating-edge-functions`
      );
    }
  }
}

export function validateMiddlewareRuntime(
  runtime: string | undefined,
  entrypoint: string,
  requiredRuntime?: 'nodejs'
) {
  validateConfiguredRuntime(runtime, entrypoint);

  if (requiredRuntime === 'nodejs' && isEdgeRuntime(runtime)) {
    throw new Error(
      `${entrypoint}: explicit proxy entrypoints only support the Node.js runtime. Remove \`runtime: ${JSON.stringify(runtime)}\` from the exported \`config\`.`
    );
  }
}

export const MIDDLEWARE_NODEJS_DEFAULT_ENV =
  'VERCEL_MIDDLEWARE_DEFAULT_RUNTIME_NODEJS';

/** Projects created on or after this date default middleware to Node.js. */
export const MIDDLEWARE_NODEJS_DEFAULT_SINCE = new Date('2026-09-01T00:00:00Z');

export const edgeMiddlewareDeprecationWarning = (entrypoint: string) =>
  `Warning: ${entrypoint} uses the deprecated "edge" runtime. Migrate to the Node.js runtime for better performance and reliability by exporting \`const config = { runtime: 'nodejs' }\`. Learn more: https://vercel.com/docs/routing-middleware#runtime-options`;

/**
 * `middleware.[jt]s` defaults to edge. Projects created on or after
 * `MIDDLEWARE_NODEJS_DEFAULT_SINCE` default to Node.js instead — in dev by date
 * alone, elsewhere only when the platform sets `MIDDLEWARE_NODEJS_DEFAULT_ENV`.
 */
export function resolveMiddlewareRuntime({
  configuredRuntime,
  middlewareRuntime,
  projectCreatedAt,
  isDev,
  env,
}: {
  configuredRuntime: string | undefined;
  middlewareRuntime: 'nodejs' | undefined;
  projectCreatedAt: number | undefined;
  isDev: boolean | undefined;
  env: Record<string, string | undefined>;
}): { runtime: 'edge' | 'nodejs'; reason: string } {
  if (isEdgeRuntime(configuredRuntime)) {
    return { runtime: 'edge', reason: 'config.runtime' };
  }
  if (configuredRuntime === 'nodejs') {
    return { runtime: 'nodejs', reason: 'config.runtime' };
  }
  if (middlewareRuntime === 'nodejs') {
    return { runtime: 'nodejs', reason: 'proxy entrypoint' };
  }
  if (env[MIDDLEWARE_NODEJS_DEFAULT_ENV] === '0') {
    return { runtime: 'edge', reason: `${MIDDLEWARE_NODEJS_DEFAULT_ENV}=0` };
  }

  const enabled = isDev === true || env[MIDDLEWARE_NODEJS_DEFAULT_ENV] === '1';
  const isNewProject =
    projectCreatedAt !== undefined &&
    projectCreatedAt >= MIDDLEWARE_NODEJS_DEFAULT_SINCE.getTime();

  return enabled && isNewProject
    ? { runtime: 'nodejs', reason: 'project creation date' }
    : { runtime: 'edge', reason: 'default' };
}

export async function serializeBody(
  request: IncomingMessage
): Promise<Buffer | undefined> {
  return request.method !== 'GET' && request.method !== 'HEAD'
    ? await streamToBuffer(request)
    : undefined;
}
