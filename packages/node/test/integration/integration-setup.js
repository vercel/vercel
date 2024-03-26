const fs = require('fs');
const path = require('path');
const { intoChunks } = require('../../../../utils/chunk-tests');

const {
  testDeployment,
} = require('../../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);

module.exports = function setupTests(groupIndex) {
  const fixturesPath = path.resolve(__dirname, '../fixtures');
  const testsThatFailToBuild = new Map([
    [
      '45-noEmitOnError-true',
      `index.ts(3,19): error TS2339: Property 'thisDoesNotExist' does not exist on type 'IncomingMessage'.\n`,
    ],
  ]);

  let fixtures = fs.readdirSync(fixturesPath);

  if (typeof groupIndex !== 'undefined') {
    fixtures = intoChunks(1, 5, fixtures)[groupIndex - 1];

    console.log('testing group', groupIndex, fixtures);
  }

  // eslint-disable-next-line no-restricted-syntax
  //for (const fixture of fixtures) {
  for (const fixture of ['10-node-engines']) {
    const errMsg = testsThatFailToBuild.get(fixture);
    if (errMsg) {
      // eslint-disable-next-line no-loop-func
      it(`should fail to build ${fixture}`, async () => {
        try {
          await testDeployment(path.join(fixturesPath, fixture));
        } catch (err) {
          expect(err).toBeTruthy();
          expect(err.deployment).toBeTruthy();
          expect(err.deployment.errorMessage).toBe(errMsg);
        }
      });
      continue; //eslint-disable-line
    }
    it(`should build ${fixture}`, async () => {
      await expect(
        testDeployment(path.join(fixturesPath, fixture))
      ).resolves.toBeDefined();
    });
  }
};
