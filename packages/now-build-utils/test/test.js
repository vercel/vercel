/* global beforeAll, expect, it, jest */
const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(2 * 60 * 1000);
let buildUtilsUrl;

beforeAll(async () => {
  const buildUtilsPath = path.resolve(__dirname, '..');
  buildUtilsUrl = await packAndDeploy(buildUtilsPath);
  console.log('buildUtilsUrl', buildUtilsUrl);
});

const buildersToTestWith = ['now-node-server', 'now-static-build'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`,
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath)) {
    // eslint-disable-next-line no-loop-func
    it(`should build ${builder}/${fixture}`, async () => {
      await expect(
        testDeployment({ buildUtilsUrl }, path.join(fixturesPath, fixture)),
      ).resolves.toBe(undefined);
    });
  }
}
