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
