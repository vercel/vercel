import fs from 'fs-extra';
import path from 'path';
import { getPrerenderManifest } from '../../src/utils';

const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');
const runBuildLambda = createRunBuildLambda(builder);

// Test the build-output contract, including builds restored from a task cache.
// Next.js tests the production of hasParamMatching separately. No Next.js build
// runs here: these fixtures contain the manifests consumed by the builder.
describe('parameter matching build output', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    '0',
    '1',
  ])('rejects legacy output with NEXT_ENABLE_ADAPTER=%s', async adapterEnabled => {
    vi.stubEnv('NEXT_ENABLE_ADAPTER', adapterEnabled);
    vi.stubEnv('NEXT_BUILDER_INTEGRATION', '');

    await expect(
      runBuildLambda(path.join(__dirname, 'param-matching-legacy'))
    ).rejects.toMatchObject({
      code: 'NEXT_PARAM_MATCHING_REQUIRES_ADAPTER',
      message: expect.stringMatching(
        /`unstable_paramMatching` and `unstable_generateParamMatching` are not yet supported.*`--prebuilt` without the Vercel Next\.js adapter.*`NEXT_ENABLE_ADAPTER=0`.*future Next\.js release, before or when these APIs become stable/
      ),
    });
  });

  it('accepts adapter output even when the opt-in is no longer set', async () => {
    vi.stubEnv('NEXT_ENABLE_ADAPTER', '0');

    const { buildResult, workPath } = await runBuildLambda(
      path.join(__dirname, 'param-matching-adapter')
    );

    expect(buildResult).toEqual({
      buildOutputPath: path.join(workPath, 'custom-build/output'),
      buildOutputVersion: 3,
    });
    expect(
      await fs.readFile(
        path.join(buildResult.buildOutputPath, 'static/index.html'),
        'utf8'
      )
    ).toContain('Adapter output');
  });

  it.each([
    'unconfigured',
    'older',
    'missing',
  ])('continues reading %s manifests without parameter matching', async outputDirectory => {
    const manifest = await getPrerenderManifest(
      path.join(__dirname, 'param-matching-compatible'),
      outputDirectory
    );

    expect(manifest.staticRoutes).toEqual({});
    expect(manifest.blockingFallbackRoutes).toEqual({});
    expect(manifest.fallbackRoutes).toEqual({});
  });
});
