const fs = require('fs');
const path = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it.skip(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
