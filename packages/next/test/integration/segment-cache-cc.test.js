process.env.NEXT_BUILDER_INTEGRATION = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

describe('clientSegmentCache prerender headers', () => {
  it('should include cache tags on fallback segment prerenders', async () => {
    const fixturePath = path.join(__dirname, 'segment-cache-cc');

    const {
      buildResult: { output },
    } = await runBuildLambda(fixturePath);

    // should include cache tags on fallback segment prerenders
    const key = 'careers/[slug].segments/_tree.segment.rsc';
    expect(output[key]).toBeDefined();
    expect(output[key].type).toBe('Prerender');
    expect(output[key].initialHeaders).toBeDefined();
    expect(output[key].initialHeaders['x-next-cache-tags']).toContain(
      'segment-cache-tag'
    );

    // should include cache tags on static segment prerenders
    const staticKeys = [
      'careers/foobar-1.segments/_full.segment.rsc',
      'careers.segments/_full.segment.rsc',
      'index.segments/_full.segment.rsc',
    ];

    for (const staticKey of staticKeys) {
      expect(output[staticKey]).toBeDefined();
      expect(output[staticKey].type).toBe('Prerender');
      expect(output[staticKey].initialHeaders).toBeDefined();
    }
  });

  it('should surface hasPostponed as a tri-state on Prerender outputs', async () => {
    const fixturePath = path.join(__dirname, 'segment-cache-cc');

    const {
      buildResult: { output },
    } = await runBuildLambda(fixturePath);

    const prerender = key => {
      expect(output[key], `expected output[${key}] to exist`).toBeDefined();
      expect(output[key].type).toBe('Prerender');
      return output[key];
    };

    // App-router PPR route that postpones (Suspense around an async component
    // reading `headers()`): the static shell is generated and the dynamic hole
    // is postponed, so its `.meta` carries a postponed state.
    expect(prerender('dynamic-suspense').hasPostponed).toBe(true);
    // The signal mirrors onto the route's data (`.rsc`) and segment outputs.
    expect(prerender('dynamic-suspense.rsc').hasPostponed).toBe(true);
    expect(
      prerender('dynamic-suspense.segments/_full.segment.rsc').hasPostponed
    ).toBe(true);

    // `cacheComponents: true` route that fully prerenders (no postpone). PPR
    // machinery still exists, but `hasPostponed` distinguishes it as static.
    expect(prerender('index').hasPostponed).toBe(false);
    expect(prerender('index.rsc').hasPostponed).toBe(false);
    expect(prerender('careers').hasPostponed).toBe(false);
    // A prerendered dynamic param (from `generateStaticParams`) is static too.
    expect(prerender('careers/foobar-1').hasPostponed).toBe(false);

    // The `[slug]` dynamic fallback shell postpones, matching existing PPR
    // fallback machinery.
    expect(prerender('careers/[slug]').hasPostponed).toBe(true);
    expect(prerender('careers/[slug].rsc').hasPostponed).toBe(true);

    // Pages-router route: `hasPostponed` is an app-router signal, so it is left
    // `undefined` on both the HTML prerender and its data route.
    expect(prerender('legacy').hasPostponed).toBeUndefined();
    expect(
      prerender('_next/data/' + buildId(output) + '/legacy.json').hasPostponed
    ).toBeUndefined();
  });

  it('should surface hasFallback, htmlSize and isDynamicRoute on Prerender outputs', async () => {
    const fixturePath = path.join(__dirname, 'segment-cache-cc');

    const {
      buildResult: { output },
    } = await runBuildLambda(fixturePath);

    const prerender = key => {
      expect(output[key], `expected output[${key}] to exist`).toBeDefined();
      expect(output[key].type).toBe('Prerender');
      return output[key];
    };

    // Concrete prerenders (manifest `routes`): not dynamic templates, so
    // `isDynamicRoute` is `false` and `hasFallback` doesn't apply (`undefined`).
    // Their HTML shell exists on disk, so `htmlSize` is a byte count.
    for (const key of ['index', 'careers', 'careers/foobar-1']) {
      expect(prerender(key).isDynamicRoute).toBe(false);
      expect(prerender(key).hasFallback).toBeUndefined();
      expect(typeof prerender(key).htmlSize).toBe('number');
      expect(prerender(key).htmlSize).toBeGreaterThan(0);
    }

    // PPR route that postpones but is still a concrete prerender.
    expect(prerender('dynamic-suspense').isDynamicRoute).toBe(false);
    expect(prerender('dynamic-suspense').hasFallback).toBeUndefined();
    expect(typeof prerender('dynamic-suspense').htmlSize).toBe('number');

    // The two route-level booleans mirror onto the data (`.rsc`) outputs, but
    // `htmlSize` is HTML-only — the `.rsc` entry isn't an HTML shell.
    expect(prerender('dynamic-suspense.rsc').isDynamicRoute).toBe(false);
    expect(prerender('dynamic-suspense.rsc').hasFallback).toBeUndefined();
    expect(prerender('dynamic-suspense.rsc').htmlSize).toBeUndefined();

    // `[slug]` dynamic template with a static fallback shell: it lives in the
    // manifest `dynamicRoutes`/`fallbackRoutes` section, so `isDynamicRoute` is
    // `true` and `hasFallback` is `true`.
    expect(prerender('careers/[slug]').isDynamicRoute).toBe(true);
    expect(prerender('careers/[slug]').hasFallback).toBe(true);
    expect(typeof prerender('careers/[slug]').htmlSize).toBe('number');
    expect(prerender('careers/[slug].rsc').isDynamicRoute).toBe(true);
    expect(prerender('careers/[slug].rsc').hasFallback).toBe(true);
    expect(prerender('careers/[slug].rsc').htmlSize).toBeUndefined();

    // Pages-router route: not from the app `dynamicRoutes` section, and there's
    // no app `.html` shell, so `isDynamicRoute` is `false` and both
    // `hasFallback` and `htmlSize` are `undefined`.
    expect(prerender('legacy').isDynamicRoute).toBe(false);
    expect(prerender('legacy').hasFallback).toBeUndefined();
    expect(prerender('legacy').htmlSize).toBeUndefined();
  });
});

// The pages-router data route key embeds the build ID, which varies per build.
// Resolve it from the emitted output keys rather than hardcoding.
function buildId(output) {
  const match = Object.keys(output).find(k =>
    /^_next\/data\/[^/]+\/legacy\.json$/.test(k)
  );
  expect(
    match,
    'expected a _next/data/<buildId>/legacy.json output'
  ).toBeDefined();
  return match.split('/')[2];
}
