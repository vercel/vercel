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
});
