/* global expect, it, jest */
const path = require('path');
const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(10 * 60 * 1000);

it('should build 01-cowsay', async () => {
  const builderPath = path.resolve(__dirname, '..');
  const builderUrl = await packAndDeploy(builderPath);

  await expect(
    testDeployment(builderUrl, path.resolve(__dirname, 'fixtures/01-cowsay')),
  ).resolves.toBe(undefined);
});
