import { describe, it, expect } from 'vitest';
import { getSkewProtectionRoute } from '../src/utils';

describe('getSkewProtectionRoute()', () => {
  it('returns a header route with `continue: true` when Skew Protection is enabled', () => {
    const route = getSkewProtectionRoute({
      VERCEL_SKEW_PROTECTION_ENABLED: '1',
      VERCEL_DEPLOYMENT_ID: 'dpl_123abc',
    });
    expect(route).toEqual({
      src: '/(.*)',
      has: [{ type: 'header', key: 'Sec-Fetch-Dest', value: 'document' }],
      headers: {
        'Set-Cookie':
          '__vdpl=dpl_123abc; Path=/; SameSite=Strict; Secure; HttpOnly',
      },
      continue: true,
    });
  });

  it('sets the cookie at the routing layer, not on the origin response', () => {
    // The whole point of the route-level rule: the function response must
    // stay free of `Set-Cookie` so the CDN can cache documents. The rule
    // must `continue` so it only decorates the response without swallowing
    // the request before the filesystem handle / SSR catch-all.
    const route = getSkewProtectionRoute({
      VERCEL_SKEW_PROTECTION_ENABLED: '1',
      VERCEL_DEPLOYMENT_ID: 'dpl_123abc',
    });
    expect(route?.continue).toBe(true);
    // Only document requests get the cookie; asset/data requests do not.
    expect(route?.has).toEqual([
      { type: 'header', key: 'Sec-Fetch-Dest', value: 'document' },
    ]);
  });

  it('returns undefined when Skew Protection is not enabled', () => {
    expect(
      getSkewProtectionRoute({
        VERCEL_DEPLOYMENT_ID: 'dpl_123abc',
      })
    ).toBeUndefined();
    expect(
      getSkewProtectionRoute({
        VERCEL_SKEW_PROTECTION_ENABLED: '0',
        VERCEL_DEPLOYMENT_ID: 'dpl_123abc',
      })
    ).toBeUndefined();
  });

  it('returns undefined when no deployment ID is available', () => {
    expect(
      getSkewProtectionRoute({
        VERCEL_SKEW_PROTECTION_ENABLED: '1',
      })
    ).toBeUndefined();
    expect(
      getSkewProtectionRoute({
        VERCEL_SKEW_PROTECTION_ENABLED: '1',
        VERCEL_DEPLOYMENT_ID: '',
      })
    ).toBeUndefined();
  });
});
