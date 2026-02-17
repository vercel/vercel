/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');
const { setTimeout } = require('timers/promises');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should cache prefetch segment routes for catch-all params named "segments"', async () => {
    const assertCached = async (rsc, segmentPrefetchValue) => {
      const prefetchUrl = `${ctx.deploymentUrl}/catch/foobar/one?_rsc=${rsc}`;
      const headers = {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': segmentPrefetchValue,
      };

      let secondCacheStatus;
      for (let attempt = 0; attempt < 3; attempt++) {
        const first = await fetch(prefetchUrl, { headers });
        expect(first.status).toBe(200);

        const second = await fetch(prefetchUrl, { headers });
        expect(second.status).toBe(200);

        secondCacheStatus = second.headers.get('x-vercel-cache');
        if (secondCacheStatus && secondCacheStatus !== 'MISS') {
          return;
        }

        await setTimeout(500 * (attempt + 1));
      }

      expect(secondCacheStatus).toBeTruthy();
      expect(secondCacheStatus).not.toBe('MISS');
    };

    await assertCached('segcache1', '/catch/$c$segments');
    await assertCached('segcache2', '/catch/$c$segments/__PAGE__');
  });
});
