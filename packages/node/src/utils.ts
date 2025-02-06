import { debug, streamToBuffer } from '@vercel/build-utils';
import { pathToRegexp } from '@vercel-internals/path-to-regexp';
import type { IncomingMessage } from 'http';
import { extname } from 'path';

// When exiting this process, wait for Vercel Function server to finish
// all its work, especially waitUntil promises before exiting this process.
//
// Here we use a short timeout (10 seconds) to let the user know that
// it has a long-running waitUntil promise.
const WAIT_UNTIL_TIMEOUT = 10;
export const WAIT_UNTIL_TIMEOUT_MS = 10 * 1000;

export const waitUntilWarning = (entrypointPath: string) =>
  `
The function \`${entrypointPath
    .split('/')
    .pop()}\` is still running after ${WAIT_UNTIL_TIMEOUT}s.
(hint: do you have a long-running waitUntil() promise?)
`.trim();

export function getRegExpFromMatchers(matcherOrMatchers: unknown): string {
  if (!matcherOrMatchers) {
    return '^/.*$';
  }
  const matchers = Array.isArray(matcherOrMatchers)
    ? matcherOrMatchers
    : [matcherOrMatchers];
  const regExps = matchers.flatMap(getRegExpFromMatcher).join('|');
  return regExps;
}

function getRegExpFromMatcher(
  matcher: unknown,
  index: number,
  allMatchers: unknown[]
): string[] {
  if (typeof matcher !== 'string') {
    throw new Error(
      "Middleware's `config.matcher` must be a path matcher (string) or an array of path matchers (string[])"
    );
  }

  if (!matcher.startsWith('/')) {
    throw new Error(
      `Middleware's \`config.matcher\` values must start with "/". Received: ${matcher}`
    );
  }

  const regExps = [pathToRegexp('316', matcher).source];
  if (matcher === '/' && !allMatchers.includes('/index')) {
    regExps.push(pathToRegexp('491', '/index').source);
  }
  return regExps;
}

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

const ALLOWED_RUNTIMES: string[] = Object.values(EdgeRuntimes);

export function validateConfiguredRuntime(
  runtime: string | undefined,
  entrypoint: string
) {
  if (runtime) {
    if (runtime === 'nodejs') {
      throw new Error(
        `${entrypoint}: \`config.runtime: "nodejs"\` semantics will evolve soon. Please remove the \`runtime\` key to keep the existing behavior.`
      );
    }

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

export async function serializeBody(
  request: IncomingMessage
): Promise<Buffer | undefined> {
  return request.method !== 'GET' && request.method !== 'HEAD'
    ? await streamToBuffer(request)
    : undefined;
}
