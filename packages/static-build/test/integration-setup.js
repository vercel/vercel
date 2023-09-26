const fs = require('fs');
const path = require('path');
const { intoChunks } = require('../../../utils/chunk-tests');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);

module.exports = function setupTests(groupIndex) {
  const fixturesPath = path.resolve(__dirname, 'fixtures');
  const testsThatFailToBuild = new Map([
    [
      '04-wrong-dist-dir',
      'No Output Directory named "out" found after the Build completed. You can configure the Output Directory in your Project Settings.',
    ],
    ['05-empty-dist-dir', 'The Output Directory "dist" is empty.'],
    [
      '06-missing-script',
      'Missing required "vercel-build" script in "package.json"',
    ],
    ['07-nonzero-sh', 'Command "./build.sh" exited with 1'],
    [
      '22-docusaurus-2-build-fail',
      'No Output Directory named "build" found after the Build completed. You can configure the Output Directory in your Project Settings.',
    ],
    [
      '36-hugo-version-not-found',
      'Version 0.0.0 of Hugo does not exist. Please specify a different one.',
    ],
  ]);
  let fixtures = fs.readdirSync(fixturesPath);

  if (typeof groupIndex !== 'undefined') {
    fixtures = intoChunks(1, 8, fixtures)[groupIndex - 1];

    console.log('testing group', groupIndex, fixtures);
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fixtures) {
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
