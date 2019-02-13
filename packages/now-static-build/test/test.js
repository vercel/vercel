/* global beforeAll, expect, it, jest */
const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);
const buildUtilsUrl = '@canary';
let builderUrl;

beforeAll(async () => {
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (fixture === '04-wrong-dist-dir') {
    // eslint-disable-next-line no-loop-func
    it(`should not build ${fixture}`, async () => {
      try {
        await testDeployment(
          { builderUrl, buildUtilsUrl },
          path.join(fixturesPath, fixture),
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
        path.join(fixturesPath, fixture),
      ),
    ).resolves.toBeDefined();
  });
}
