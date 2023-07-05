const path = require('path');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

it('should have configured `maxDuration` in build output', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, '../fixtures/63-routes-config')
  );

  expect(buildResult.output).toBeDefined();
  expect(typeof buildResult.output.maxDuration).toBe('number');
  expect(buildResult.output.maxDuration).toEqual(5);
});
