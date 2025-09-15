/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');
const cheerio = require('cheerio');
const { setTimeout } = require('timers/promises');

const pages = [
  { pathname: '/', dynamic: true },
  { pathname: '/nested/a', dynamic: true },
  { pathname: '/nested/b', dynamic: true },
  { pathname: '/nested/c', dynamic: true },
  { pathname: '/on-demand/a', dynamic: true },
  { pathname: '/on-demand/b', dynamic: true },
  { pathname: '/on-demand/c', dynamic: true },
  { pathname: '/loading/a', dynamic: true },
  { pathname: '/loading/b', dynamic: true },
  { pathname: '/loading/c', dynamic: true },
  { pathname: '/static', dynamic: false },
  { pathname: '/no-suspense', dynamic: true },
  { pathname: '/no-suspense/nested/a', dynamic: true },
  { pathname: '/no-suspense/nested/b', dynamic: true },
  { pathname: '/no-suspense/nested/c', dynamic: true },
  { pathname: '/no-fallback/a', dynamic: true },
  { pathname: '/no-fallback/b', dynamic: true },
  { pathname: '/no-fallback/c', dynamic: true },
  // TODO: uncomment when we've fixed the 404 case for force-dynamic pages
  // { pathname: '/dynamic/force-dynamic', dynamic: 'force-dynamic' },
  { pathname: '/dynamic/force-static', dynamic: 'force-static' },
];

const cases = {
  404: [
    // For routes that do not support fallback (they had `dynamicParams` set to
    // `false`), we shouldn't see any fallback behavior for routes not defined
    // in `getStaticParams`.
    { pathname: '/no-fallback/non-existent' },
  ],
};

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should handle interception route properly', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/cart`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('normal cart page');

    const res2 = await fetch(`${ctx.deploymentUrl}/cart`, {
      headers: {
        RSC: '1',
      },
    });
    const res2Body = await res2.text();
    expect(res2.status).toBe(200);
    expect(res2Body).toContain(':');
    expect(res2Body).not.toContain('<html');

    const res3 = await fetch(`${ctx.deploymentUrl}/cart`, {
      headers: {
        RSC: '1',
        'Next-Url': '/cart',
        'Next-Router-Prefetch': '1',
      },
    });
    const res3Body = await res3.text();
    expect(res3.status).toBe(200);
    expect(res3Body).toContain(':');
    expect(res3Body).not.toContain('<html');

    const res4 = await fetch(`${ctx.deploymentUrl}/cart`, {
      headers: {
        RSC: '1',
        'Next-Url': '/cart',
      },
    });
    const res4Body = await res4.text();
    expect(res4.status).toBe(200);
    expect(res4Body).toContain(':');
    expect(res4Body).not.toContain('<html');
  });

  describe('dynamic pages should resume', () => {
    it.each(pages.filter(p => p.dynamic === true))(
      'should resume $pathname',
      async ({ pathname }) => {
        const expected = `${Date.now()}:${Math.random()}`;
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
          headers: { 'X-Test-Input': expected },
        });
        expect(res.status).toEqual(200);
        expect(res.headers.get('content-type')).toEqual(
          'text/html; charset=utf-8'
        );
        const html = await res.text();
        expect(html).toContain(expected);
        expect(html).toContain('</html>');

        // Validate that the loaded URL is correct.
        expect(html).toContain(`data-pathname=${pathname}`);
      }
    );

    it.each(cases[404])(
      'should return 404 for $pathname',
      async ({ pathname }) => {
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`);
        expect(res.status).toEqual(404);
      }
    );
  });

  describe('prefetch RSC payloads should return', () => {
    it.each(pages)(
      'should prefetch $pathname',
      async ({ pathname, dynamic }) => {
        const unexpected = `${Date.now()}:${Math.random()}`;
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
          headers: {
            RSC: '1',
            'Next-Router-Prefetch': '1',
            'X-Test-Input': unexpected,
          },
        });
        expect(res.status).toEqual(200);
        expect(res.headers.get('content-type')).toEqual('text/x-component');

        const cache = res.headers.get('cache-control');
        expect(cache).toContain('public');
        expect(cache).toContain('must-revalidate');

        // Expect that static RSC prefetches do not contain the dynamic text.
        const text = await res.text();
        expect(text).not.toContain(unexpected);

        if (dynamic === true) {
          // The dynamic component will contain the text "needle" if it was
          // rendered using dynamic content.
          expect(text).not.toContain('needle');
          expect(res.headers.get('X-NextJS-Postponed')).toEqual('1');
        } else {
          if (dynamic !== false) {
            expect(text).toContain('needle');
          }

          expect(res.headers.has('X-NextJS-Postponed')).toEqual(false);
        }
      }
    );

    it.each(cases[404])(
      'should return 404 for $pathname',
      async ({ pathname }) => {
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
          headers: { RSC: 1, 'Next-Router-Prefetch': '1' },
        });
        expect(res.status).toEqual(404);
      }
    );
  });

  describe('dynamic RSC payloads should return', () => {
    it.each(pages)('should fetch $pathname', async ({ pathname, dynamic }) => {
      const expected = `${Date.now()}:${Math.random()}`;
      const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
        headers: { RSC: '1', 'X-Test-Input': expected },
      });
      expect(res.status).toEqual(200);
      expect(res.headers.get('content-type')).toEqual('text/x-component');
      expect(res.headers.has('X-NextJS-Postponed')).toEqual(false);

      const cache = res.headers.get('cache-control');
      expect(cache).toContain('private');
      expect(cache).toContain('no-store');
      expect(cache).toContain('no-cache');
      expect(cache).toContain('max-age=0');
      expect(cache).toContain('must-revalidate');

      const text = await res.text();

      if (dynamic !== false) {
        expect(text).toContain('needle');
      }

      if (dynamic === true) {
        // Expect that dynamic RSC prefetches do contain the dynamic text.
        expect(text).toContain(expected);
      } else {
        // Expect that dynamic RSC prefetches do not contain the dynamic text
        // when we're forced static.
        expect(text).not.toContain(expected);
      }
    });

    it.each(cases[404])(
      'should return 404 for $pathname',
      async ({ pathname }) => {
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
          headers: { RSC: 1 },
        });
        expect(res.status).toEqual(404);
      }
    );
  });

  describe('fallback should be used correctly', () => {
    const assertRouteShell = $ => {
      expect($('[data-page]').closest('[hidden]')).toHaveLength(0);
    };

    const assertFallbackShell = $ => {
      expect($('[data-loading]')).toHaveLength(1);
      expect($('[data-page]').closest('[hidden]')).toHaveLength(1);
    };

    const assertDynamicPostponed = $ => {
      expect($('[data-agent]').closest('[hidden]')).toHaveLength(1);
    };

    const retry = async (fn, times = 5) => {
      let err;

      for (let i = 0; i < times; i++) {
        try {
          return await fn();
        } catch (error) {
          err = error;

          // If this isn't the last retry, we should wait for the next one.
          if (i + 1 < times) await setTimeout(1000 * (i + 1));
        }
      }

      throw err;
    };

    describe('cache should be resilient to poisoning', () => {
      const routes = [
        { pathname: '/fallback/poison/test-01/dynamic', slug: 'test-01' },
        { pathname: '/fallback/poison/test-02/dynamic', slug: 'test-02' },
        { pathname: '/fallback/poison/test-03/dynamic', slug: 'test-03' },
        { pathname: '/fallback/poison/static-01/dynamic', slug: 'static-01' },
        { pathname: '/fallback/poison/static-02/dynamic', slug: 'static-02' },
        { pathname: '/fallback/poison/test-04', slug: 'test-04' },
        { pathname: '/fallback/poison/test-05', slug: 'test-05' },
        { pathname: '/fallback/poison/test-06', slug: 'test-06' },
        { pathname: '/fallback/poison/static-01', slug: 'static-01' },
        { pathname: '/fallback/poison/static-02', slug: 'static-02' },
      ];

      it('should not poison the cache', async () => {
        for (const { pathname, slug } of routes) {
          let res = await fetch(`${ctx.deploymentUrl}${pathname}`);
          expect(res.status).toEqual(200);

          let html = await res.text();
          let $ = cheerio.load(html);

          // Expect that the poisoned page contains the correct slug. A failure
          // here means that the cache was poisoned.
          expect($('[data-slug]').data('slug')).toEqual(slug);

          res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
            headers: {
              "rsc": "1",
              "Next-Router-Prefetch": "1",
            }
          });
          expect(res.status).toEqual(200);

          let rsc = await res.text();

          // Expect that the page contains the correct slug in the RSC payload.
          // A failure here means that the cache was poisoned.
          expect(rsc).toContain(slug);

          // Send the revalidation request.
          res = await fetch(`${ctx.deploymentUrl}/api/revalidate${pathname}`, {
            method: 'DELETE',
          });
          expect(res.status).toEqual(200);

          // Should still have the correct results.
          res = await fetch(`${ctx.deploymentUrl}${pathname}`);
          expect(res.status).toEqual(200);

          html = await res.text();
          $ = cheerio.load(html);

          // Expect that the poisoned page contains the correct slug. If it's
          // poisoned, the slug will be incorrect.
          expect($('[data-slug]').data('slug')).toEqual(slug);

          res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
            headers: {
              "rsc": "1",
              "Next-Router-Prefetch": "1",
            }
          });
          expect(res.status).toEqual(200);

          rsc = await res.text();

          // Expect that the page contains the correct slug in the RSC payload.
          // A failure here means that the cache was poisoned.
          expect(rsc).toContain(slug);
        }
      });
    });

    it('should use the fallback shell on the first request', async () => {
      const res = await fetch(`${ctx.deploymentUrl}/fallback/first`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('PRERENDER');

      const html = await res.text();
      const $ = cheerio.load(html);
      expect($('[data-loading]').length).toEqual(1);
      expect($('[data-page]').closest('[hidden]').length).toEqual(1);
    });

    it('should use the route shell on the second request', async () => {
      let res = await fetch(`${ctx.deploymentUrl}/fallback/second`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

      let html = await res.text();
      let $ = cheerio.load(html);
      assertFallbackShell($);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/second`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

        html = await res.text();
        $ = cheerio.load(html);
        assertFallbackShell($);
      });
    });

    it('should handle dynamic resumes on the fallback pages', async () => {
      let res = await fetch(`${ctx.deploymentUrl}/fallback/first/dynamic`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('PRERENDER');

      let html = await res.text();
      let $ = cheerio.load(html);
      assertFallbackShell($);
      assertDynamicPostponed($);
    });

    it('should serve the fallback shell for new pages', async () => {
      let res = await fetch(`${ctx.deploymentUrl}/fallback/second/dynamic`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

      let html = await res.text();
      let $ = cheerio.load(html);
      assertFallbackShell($);
      assertDynamicPostponed($);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/second/dynamic`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

        html = await res.text();
        $ = cheerio.load(html);
        assertFallbackShell($);
        assertDynamicPostponed($);
      });

      res = await fetch(`${ctx.deploymentUrl}/fallback/third/dynamic`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

      html = await res.text();
      $ = cheerio.load(html);
      assertFallbackShell($);
      assertDynamicPostponed($);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/third/dynamic`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

        html = await res.text();
        $ = cheerio.load(html);
        assertFallbackShell($);
        assertDynamicPostponed($);
      });
    });

    // https://linear.app/vercel/issue/ZERO-3240/unskip-random-test-failures
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('should revalidate the pages and perform a blocking render when the fallback is revalidated', async () => {
      let res = await fetch(`${ctx.deploymentUrl}/fallback/static-01/dynamic`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('PRERENDER');

      let html = await res.text();
      let $ = cheerio.load(html);
      assertRouteShell($);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/static-01/dynamic`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

        html = await res.text();
        $ = cheerio.load(html);
        assertRouteShell($);
      });

      // Send the revalidation request.
      res = await fetch(
        `${ctx.deploymentUrl}/api/revalidate/fallback/static-01/dynamic`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toEqual(200);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/static-01/dynamic`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toMatch(/REVALIDATED|STALE/);

        html = await res.text();
        $ = cheerio.load(html);
        assertRouteShell($);
      });

      // The remaining requests should be cached.
      res = await fetch(`${ctx.deploymentUrl}/fallback/static-02/dynamic`);
      expect(res.status).toEqual(200);
      expect(res.headers.get('x-vercel-cache')).toEqual('PRERENDER');

      html = await res.text();
      $ = cheerio.load(html);
      assertDynamicPostponed($);

      await retry(async () => {
        res = await fetch(`${ctx.deploymentUrl}/fallback/static-02/dynamic`);
        expect(res.status).toEqual(200);
        expect(res.headers.get('x-vercel-cache')).toEqual('HIT');

        html = await res.text();
        $ = cheerio.load(html);
        assertRouteShell($);
        assertDynamicPostponed($);
      });
    });
  });
});
