const fs = require('fs');
const path = require('path');
const { intoChunks } = require('../../../utils/chunk-tests');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);

module.exports = function setupTests(groupIndex) {
  const fixturesPath = path.resolve(__dirname, 'fixtures');
  const testsThatFailToBuild = new Map([
    ['30-fail-build-invalid-pipfile', 'Unable to parse Pipfile.lock'],
    [
      '31-fail-build-invalid-python36',
      'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.',
    ],
  ]);
  const allFixtures = fs.readdirSync(fixturesPath);

  let chunkedFixtures = allFixtures;
  if (typeof groupIndex !== 'undefined') {
    chunkedFixtures = intoChunks(1, 2, allFixtures)[groupIndex - 1];

    console.log('testing group', groupIndex, chunkedFixtures);
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of chunkedFixtures) {
    // Python endpoints require the AL2 build image
    const projectSettings = {
      nodeVersion: '18.x',
    };
    const errMsg = testsThatFailToBuild.get(fixture);
    if (errMsg) {
      // eslint-disable-next-line no-loop-func
      it(`should fail to build ${fixture}`, async () => {
        try {
          await testDeployment(path.join(fixturesPath, fixture), {
            projectSettings,
          });
        } catch (err) {
          expect(err).toBeTruthy();
          expect(err.deployment).toBeTruthy();
          expect(err.deployment.errorMessage).toBe(errMsg);
        }
      });
      continue; //eslint-disable-line
    }
    // eslint-disable-next-line no-loop-func
    it(`should build ${fixture}`, async () => {
      await expect(
        testDeployment(path.join(fixturesPath, fixture), {
          projectSettings,
        })
      ).resolves.toBeDefined();
    });
  }
};
