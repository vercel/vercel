const fs = require('fs');
const { join } = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);

const fixturesPath = join(__dirname, 'fixtures-legacy');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
