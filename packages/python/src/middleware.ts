import { extname } from 'path';
import { pathToRegexp } from 'path-to-regexp';

function getRegExpFromMatcher(
  matcher: unknown,
  allMatchers: unknown[]
): string[] {
  if (typeof matcher !== 'string') {
    throw new Error(
      "Routing Middleware's matcher must be a path matcher (string) or an array of path matchers (string[])"
    );
  }

  if (!matcher.startsWith('/')) {
    throw new Error(
      `Routing Middleware matcher values must start with "/". Received: ${matcher}`
    );
  }

  const regExps = [pathToRegexp(matcher).source];
  if (matcher === '/' && !allMatchers.includes('/index')) {
    regExps.push(pathToRegexp('/index').source);
  }
  return regExps;
}

export function getRegExpFromMatchers(matcherOrMatchers: unknown): string {
  if (!matcherOrMatchers) {
    return '^/.*$';
  }
  const matchers = Array.isArray(matcherOrMatchers)
    ? matcherOrMatchers
    : [matcherOrMatchers];
  return matchers
    .flatMap(matcher => getRegExpFromMatcher(matcher, matchers))
    .join('|');
}

export function entrypointToOutputPath(
  entrypoint: string,
  zeroConfig?: boolean
): string {
  if (!zeroConfig) {
    return entrypoint;
  }
  const ext = extname(entrypoint);
  return entrypoint.slice(0, entrypoint.length - ext.length);
}
