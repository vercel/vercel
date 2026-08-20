import { pathToRegexp } from '@vercel/routing-utils';

/**
 * Convert a path matcher (a string or an array of strings, each beginning with
 * "/") into a single route `src` regular-expression source. A falsy matcher
 * means "match everything" and yields the catch-all `^/.*$`.
 *
 * Shared by the Node builder's middleware routes and the Python builder's
 * platform-proxy routes so both emit identical `src` patterns for the
 * `before_filesystem` routing phase.
 */
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

/**
 * Reconcile a matcher configured out-of-band (e.g. `proxy.matcher`) with one a
 * source file exports as `config.matcher`. Exactly one may be set.
 */
export function resolveMiddlewareMatcher(
  configuredMatcher: string | string[] | undefined,
  sourceMatcher: unknown,
  entrypoint: string
): unknown {
  if (configuredMatcher !== undefined && sourceMatcher !== undefined) {
    throw new Error(
      `${entrypoint}: \`proxy.matcher\` in vercel.json conflicts with \`config.matcher\` exported from the proxy entrypoint. Configure the matcher in only one location.`
    );
  }

  return configuredMatcher ?? sourceMatcher;
}

function getRegExpFromMatcher(
  matcher: unknown,
  _index: number,
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
