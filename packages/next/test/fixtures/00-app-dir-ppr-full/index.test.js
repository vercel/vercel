/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');

const pages = [
  { pathname: '/', dynamic: true },
  { pathname: '/nested/a', dynamic: true },
  { pathname: '/nested/b', dynamic: true },
  { pathname: '/nested/c', dynamic: true },
  { pathname: '/on-demand/a', dynamic: true },
  { pathname: '/on-demand/b', dynamic: true },
  { pathname: '/on-demand/c', dynamic: true },
  { pathname: '/static', dynamic: false },
  { pathname: '/no-suspense', dynamic: true },
  { pathname: '/no-suspense/nested/a', dynamic: true },
  { pathname: '/no-suspense/nested/b', dynamic: true },
  { pathname: '/no-suspense/nested/c', dynamic: true },
  // TODO: uncomment when we've fixed the 404 case for force-dynamic pages
  // { pathname: '/dynamic/force-dynamic', dynamic: 'force-dynamic' },
  { pathname: '/dynamic/force-static', dynamic: false },
];

const ctx = {};

const MAX_ATTEMPTS = 3;
async function retry(fn) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt + 1 >= MAX_ATTEMPTS) {
        throw err;
      }
    }
  }
}

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  describe('dynamic pages should resume', () => {
    it.each(pages.filter(p => p.dynamic))(
      'should resume $pathname',
      async ({ pathname }) => {
        await retry(async () => {
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
        });
      }
    );
  });

  describe('prefetch RSC payloads should return', () => {
    it.each(pages)(
      'should prefetch $pathname',
      async ({ pathname, dynamic }) => {
        await retry(async () => {
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
          console.log(
            'X-NextJS-Postponed-Reason',
            res.headers.get('X-NextJS-Postponed-Reason')
          );
          if (dynamic) {
            expect(res.headers.get('X-NextJS-Postponed')).toEqual('1');
          } else {
            expect(res.headers.has('X-NextJS-Postponed')).toEqual(false);
          }

          // Expect that static RSC prefetches do not contain the dynamic text.
          const text = await res.text();
          expect(text).not.toContain(unexpected);
        });
      }
    );
  });

  describe('dynamic RSC payloads should return', () => {
    it.each(pages)('should fetch $pathname', async ({ pathname, dynamic }) => {
      await retry(async () => {
        const expected = `${Date.now()}:${Math.random()}`;
        const res = await fetch(`${ctx.deploymentUrl}${pathname}`, {
          headers: { RSC: '1', 'X-Test-Input': expected },
        });
        expect(res.status).toEqual(200);
        expect(res.headers.get('content-type')).toEqual('text/x-component');
        expect(res.headers.has('X-NextJS-Postponed')).toEqual(false);

        const text = await res.text();
        if (dynamic) {
          // Expect that dynamic RSC prefetches do contain the dynamic text.
          expect(text).toContain(expected);
        } else {
          // Expect that dynamic RSC prefetches do not contain the dynamic text
          // when we're forced static.
          expect(text).not.toContain(expected);
        }
      });
    });
  });
});
