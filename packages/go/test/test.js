const fs = require('fs');
const path = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);

const skipFixtures = ['08-include-files'];
const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (skipFixtures.includes(fixture)) {
    console.log(`Skipping test fixture ${fixture}`);
    continue;
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment({}, path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
