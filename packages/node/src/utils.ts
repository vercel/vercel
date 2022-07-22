import { extname } from 'path';
import { pathToRegexp } from 'path-to-regexp';

export function getRegExpFromMatchers(matcherOrMatchers: unknown): string {
  if (!matcherOrMatchers) {
    return '^/.*$';
  }
  const matchers = Array.isArray(matcherOrMatchers)
    ? matcherOrMatchers
    : [matcherOrMatchers];
  return matchers.map(getRegExpFromMatcher).join('|');
}

function getRegExpFromMatcher(matcher: unknown): string {
  if (typeof matcher !== 'string') {
    throw new Error(
      '`matcher` must be a path matcher or an array of path matchers'
    );
  }

  if (!matcher.startsWith('/')) {
    throw new Error('`matcher`: path matcher must start with /');
  }

  const re = pathToRegexp(matcher);
  return re.source;
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
