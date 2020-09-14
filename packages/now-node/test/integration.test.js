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
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

const testsThatFailToBuild = new Map([
  [
    '45-noEmitOnError-true',
    `index.ts(3,19): error TS2339: Property 'thisDoesNotExist' does not exist on type 'IncomingMessage'.\n`,
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
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture)
      )
    ).resolves.toBeDefined();
  });
}
