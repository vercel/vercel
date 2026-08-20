import { describe, it, expect } from 'vitest';
import { getRegExpFromMatchers } from '../src';

/**
 * Locks the semantics of the shared matcher helper hoisted out of the Node
 * builder. Both the Node middleware routes and the Python platform-proxy
 * routes depend on these exact behaviors (and on it staying exported).
 */
describe('getRegExpFromMatchers', () => {
  it('returns the catch-all for a falsy matcher', () => {
    expect(getRegExpFromMatchers(undefined)).toBe('^/.*$');
    expect(getRegExpFromMatchers('')).toBe('^/.*$');
  });

  it('compiles a single matcher into a regexp that scopes paths', () => {
    const src = getRegExpFromMatchers('/admin/:path*');
    const re = new RegExp(src);
    expect(re.test('/admin')).toBe(true);
    expect(re.test('/admin/settings')).toBe(true);
    expect(re.test('/public')).toBe(false);
  });

  it('unions an array of matchers with "|"', () => {
    const union = getRegExpFromMatchers(['/a', '/b']);
    expect(union).toBe(
      `${getRegExpFromMatchers('/a')}|${getRegExpFromMatchers('/b')}`
    );
    const re = new RegExp(union);
    expect(re.test('/a')).toBe(true);
    expect(re.test('/b')).toBe(true);
    expect(re.test('/c')).toBe(false);
  });

  it('throws when a matcher does not start with "/"', () => {
    expect(() => getRegExpFromMatchers('admin')).toThrow(/must start with/);
    expect(() => getRegExpFromMatchers(['/ok', 'bad'])).toThrow(
      /must start with/
    );
  });

  it('throws when a matcher is not a string', () => {
    expect(() => getRegExpFromMatchers([42])).toThrow(/path matcher/);
  });
});
