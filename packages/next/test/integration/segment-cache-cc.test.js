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

  it('should surface prerenderClassification on Prerender outputs', async () => {
    const fixturePath = path.join(__dirname, 'segment-cache-cc');

    const {
      buildResult: { output },
    } = await runBuildLambda(fixturePath);

    const prerender = key => {
      expect(output[key], `expected output[${key}] to exist`).toBeDefined();
      expect(output[key].type).toBe('Prerender');
      return output[key];
    };
    // `htmlSize` is a byte count that shifts with every Next.js release, so
    // assert on its presence rather than its value.
    const classification = key => {
      const actual = prerender(key).prerenderClassification;
      expect(actual, `expected a classification on ${key}`).toBeDefined();
      const { htmlSize, ...rest } = actual;
      return { ...rest, htmlSize: typeof htmlSize };
    };

    // `cacheComponents: true` app routes that fully prerender: the whole
    // response is in the shell and nothing is left to compute per-request.
    for (const key of ['index', 'careers', 'careers/foobar-1']) {
      expect(classification(key)).toEqual({
        routeType: 'page',
        response: 'complete',
        compute: 'static',
        htmlSize: 'number',
      });
    }

    // Suspense around an async component reading `headers()`: the shell is
    // prerendered and the dynamic hole is postponed, so the response is only
    // the initial part and the request resumes it.
    expect(classification('dynamic-suspense')).toEqual({
      routeType: 'page',
      response: 'initial',
      compute: 'resuming',
      htmlSize: 'number',
    });

    // `[slug]` is a dynamic template with a prerendered fallback shell. It
    // still has unprerendered params, so it is a fallback rather than a shell.
    expect(classification('careers/[slug]')).toEqual({
      routeType: 'fallback',
      response: 'initial',
      compute: 'resuming',
      htmlSize: 'number',
    });

    // Pages-router ISR route: classified, but there is no app HTML shell to
    // measure.
    expect(classification('legacy')).toEqual({
      routeType: 'page',
      response: 'complete',
      compute: 'static',
      htmlSize: 'undefined',
    });

    // A route in the manifest's `notFoundRoutes` gets no classification from
    // Next.js, and must not be given a synthesized one.
    expect(prerender('missing').prerenderClassification).toBeUndefined();

    // Only the primary output of a route group is classified — the sibling
    // data, prefetch and segment prerenders are grouped back to it downstream
    // via `sourcePath`, and must not each contribute a classified row.
    for (const key of [
      'index.rsc',
      'dynamic-suspense.rsc',
      'dynamic-suspense.segments/_full.segment.rsc',
      'careers/[slug].rsc',
      'careers/[slug].segments/_tree.segment.rsc',
      '_next/data/' + buildId(output) + '/legacy.json',
    ]) {
      expect(
        prerender(key).prerenderClassification,
        `expected no classification on ${key}`
      ).toBeUndefined();
    }
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
