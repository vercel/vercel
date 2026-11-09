process.env.NEXT_BUILDER_INTEGRATION = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../..');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('immutable static files without the adapter', () => {
  it.each([
    'server',
    'export',
  ])('rejects immutable assets from a real %s build', async output => {
    vi.stubEnv('NEXT_ENABLE_ADAPTER', '0');
    vi.stubEnv('NEXT_TEST_OUTPUT_EXPORT', output === 'export' ? '1' : '0');

    await expect(
      runBuildLambda(path.join(__dirname, 'immutable-static-files'))
    ).rejects.toMatchObject({
      code: 'NEXT_BUILDER_IMMUTABLE_STATIC_FILES',
      message:
        'The Next.js build produced files in "_next/static/immutable" while the Next.js adapter was disabled. Use the Next.js Vercel Adapter instead of manually setting supportsImmutableAssets:true.',
    });
  });
});
