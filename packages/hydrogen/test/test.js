const fs = require('fs');
const path = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);

const fixturesPath = path.resolve(__dirname, 'fixtures');

// Skip fixtures using deprecated @shopify/hydrogen v1 packages that fail npm install
const skipped = ['demo-store-js', 'demo-store-ts'];

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (skipped.includes(fixture)) {
    console.log(`Skipping: ${fixture}`);
    continue;
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
