const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);

let builderUrl;
const buildUtilsUrl = version.includes('canary') ? '@canary' : undefined;

beforeAll(async () => {
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
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
