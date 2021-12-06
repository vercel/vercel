const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(5 * 60 * 1000);
let buildUtilsUrl;
let builderUrl;

beforeAll(async () => {
  if (!buildUtilsUrl) {
    const buildUtilsPath = path.resolve(__dirname, '..', '..', 'build-utils');
    buildUtilsUrl = await packAndDeploy(buildUtilsPath);
    console.log('buildUtilsUrl', buildUtilsUrl);
  }
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

const testsThatFailToBuild = new Map([
  [
    '11-version-2-5-error',
    'Found `Gemfile` with discontinued Ruby version: `ruby "~> 2.5.x".` Please set `ruby "~> 2.7.x"` in your `Gemfile` to use Ruby 2.7.x. This change is the result of a decision made by an upstream infrastructure provider (AWS).',
  ],
]);

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  const errMsg = testsThatFailToBuild.get(fixture);
  if (errMsg) {
    // eslint-disable-next-line no-loop-func
    it(`should fail to build ${fixture}`, async () => {
      try {
        await testDeployment(
          { builderUrl, buildUtilsUrl },
          path.join(fixturesPath, fixture)
        );
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
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture)
      )
    ).resolves.toBeDefined();
  });
}
