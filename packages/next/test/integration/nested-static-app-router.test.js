process.env.NEXT_BUILDER_INTEGRATION = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

vi.setConfig({ testTimeout: 360000, hookTimeout: 360000 });

/**
 * PIPE-7285: nested static App Router routes fail on Windows because
 * getServerlessPages keys lambdas with path.join() (backslash) while
 * lookup uses posix separators. Single-segment routes have no separator
 * so they succeed; 2+ segments fail with NEXT_MISSING_LAMBDA.
 */
it('should build nested static App Router routes', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, '../fixtures/repro-pipe-7285-nested-static-app')
  );

  expect(buildResult.output.index).toBeDefined();
  expect(buildResult.output.plana).toBeDefined();
  expect(buildResult.output['prueba-plana/anidada']).toBeDefined();
});
