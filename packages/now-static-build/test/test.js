const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);
let buildUtilsUrl;
let builderUrl;

beforeAll(async () => {
  if (!buildUtilsUrl) {
    const buildUtilsPath = path.resolve(__dirname, '..');
    buildUtilsUrl = await packAndDeploy(buildUtilsPath);
    console.log('buildUtilsUrl', buildUtilsUrl);
  }
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');
const testsThatFailToBuild = new Set([
  '04-wrong-dist-dir',
  '05-empty-dist-dir',
  '06-missing-script',
  '07-nonzero-sh'
]);

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (testsThatFailToBuild.has(fixture)) {
    // eslint-disable-next-line no-loop-func
    it(`should not build ${fixture}`, async () => {
      try {
        await testDeployment(
          { builderUrl, buildUtilsUrl },
          path.join(fixturesPath, fixture)
        );
      } catch (err) {
        expect(err.message).toMatch(/is ERROR/);
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
