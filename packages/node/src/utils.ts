import { extname } from 'path';
import { pathToRegexp } from 'path-to-regexp';
import { hasEdgeSignature } from '@edge-runtime/feature-detector';
import { debug, NowBuildError } from '@vercel/build-utils';
import type { LauncherConfiguration } from '@vercel/node-bridge/types';

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

  const regExps = [pathToRegexp(matcher).source];
  if (matcher === '/' && !allMatchers.includes('/index')) {
    regExps.push(pathToRegexp('/index').source);
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
  console.error(error.message);
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

export function detectServerlessLauncherType(
  entrypoint: string,
  nodeMajorVersion: number
) {
  const launcherType = hasEdgeSignature(entrypoint) ? 'EdgeLight' : 'Nodejs';
  checkLauncherCompatibility(entrypoint, launcherType, nodeMajorVersion);
  return launcherType;
}

function checkLauncherCompatibility(
  entrypoint: string,
  launcherType: LauncherConfiguration['launcherType'],
  nodeMajorVersion: number
) {
  if (launcherType === 'EdgeLight' && nodeMajorVersion < 18) {
    throw new NowBuildError({
      code: 'INVALID_RUNTIME_FOR_LAUNCHER',
      message: `${launcherType} launcher type can only be used with node.js 18 and later`,
      // TODO when documentation will be available, add link: 'https://vercel.link/isomorphic-support',
    });
  }
}
