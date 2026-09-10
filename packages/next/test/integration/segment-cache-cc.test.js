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

  it('should surface initialMetadata on Prerender outputs', async () => {
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
    const initialMetadata = key => {
      const actual = prerender(key).initialMetadata;
      expect(actual, `expected initialMetadata on ${key}`).toBeDefined();
      const { htmlSize, ...rest } = actual;
      return { ...rest, htmlSize: typeof htmlSize };
    };

    // `cacheComponents: true` app routes that fully prerender: the whole
    // response is in the shell and nothing is left to compute per-request.
    for (const key of ['index', 'careers', 'careers/foobar-1']) {
      expect(initialMetadata(key)).toEqual({
        compute: 'static',
        htmlSize: 'number',
      });
    }

    // Suspense around an async component reading `headers()`: the shell is
    // prerendered and the dynamic hole is postponed, so the request resumes
    // the response on the server.
    expect(initialMetadata('dynamic-suspense')).toEqual({
      compute: 'resuming',
      htmlSize: 'number',
    });

    // `[slug]` is a dynamic template with a prerendered fallback shell that
    // postponed work, so serving it resumes on the server too.
    expect(initialMetadata('careers/[slug]')).toEqual({
      compute: 'resuming',
      htmlSize: 'number',
    });

    // Pages-router ISR route: fully static per request, and there is no app
    // HTML shell to measure.
    expect(initialMetadata('legacy')).toEqual({
      compute: 'static',
      htmlSize: 'undefined',
    });

    // Next.js also emits `routeType` and `response`, but the platform
    // consumes `compute` and `htmlSize` only — the rest must not ride
    // along into the Prerender output.
    expect(prerender('careers/[slug]').initialMetadata).not.toHaveProperty(
      'routeType'
    );
    expect(prerender('careers/[slug]').initialMetadata).not.toHaveProperty(
      'response'
    );

    // A route in the manifest's `notFoundRoutes` gets no taxonomy from
    // Next.js, and must not be given a synthesized one.
    expect(prerender('missing').initialMetadata).toBeUndefined();

    // Only the primary output of a route group carries the metadata — the
    // sibling data, prefetch and segment prerenders are grouped back to it
    // downstream via `sourcePath`, and must not each contribute a row.
    for (const key of [
      'index.rsc',
      'dynamic-suspense.rsc',
      'dynamic-suspense.segments/_full.segment.rsc',
      'careers/[slug].rsc',
      'careers/[slug].segments/_tree.segment.rsc',
      '_next/data/' + buildId(output) + '/legacy.json',
    ]) {
      expect(
        prerender(key).initialMetadata,
        `expected no initialMetadata on ${key}`
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
