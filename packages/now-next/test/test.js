/* eslint-env jest */
const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);
let buildUtilsUrl;
let builderUrl;

beforeAll(async () => {
  if (!buildUtilsUrl) {
    const buildUtilsPath = path.resolve(
      __dirname,
      '..',
      '..',
      'now-build-utils'
    );
    buildUtilsUrl = await packAndDeploy(buildUtilsPath);
    console.log('buildUtilsUrl', buildUtilsUrl);
  }

  process.env.NEXT_TELEMETRY_DISABLED = '1';
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  const context = {};

  // eslint-disable-next-line no-loop-func
  it(`Should build "${fixture}"`, async () => {
    const { deploymentId, deploymentUrl } = await testDeployment(
      { builderUrl, buildUtilsUrl },
      path.join(fixturesPath, fixture)
    );

    context.deploymentId = deploymentId;
    context.deploymentUrl = `https://${deploymentUrl}`;

    console.log('updated context', context);
  });

  const additionalTestsPath = path.join(fixturesPath, fixture, 'index.test.js');

  if (fs.existsSync(additionalTestsPath)) {
    describe(`Additional ${fixture} tests`, () => {
      require(additionalTestsPath)(context);
    });
  }
}
