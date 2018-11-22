/* global beforeAll, expect, it, jest */
const path = require('path');
const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(10 * 60 * 1000);
let builderUrl;

beforeAll(async () => {
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
});

it('should build 01-cowsay', async () => {
  await expect(
    testDeployment(builderUrl, path.resolve(__dirname, 'fixtures/01-cowsay')),
  ).resolves.toBe(undefined);
});

it('should build 02-env-vars', async () => {
  await expect(
    testDeployment(builderUrl, path.resolve(__dirname, 'fixtures/02-env-vars')),
  ).resolves.toBe(undefined);
});

it('should build 10-others', async () => {
  await expect(
    testDeployment(builderUrl, path.resolve(__dirname, 'fixtures/10-others')),
  ).resolves.toBe(undefined);
});
