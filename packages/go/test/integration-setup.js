const fs = require('fs');
const path = require('path');
const { intoChunks } = require('../../../utils/chunk-tests');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);

module.exports = function setupTests(groupIndex) {
  const fixturesPath = path.resolve(__dirname, 'fixtures');
  let fixtures = fs.readdirSync(fixturesPath).sort();

  if (typeof groupIndex !== 'undefined') {
    fixtures = intoChunks(1, 2, fixtures)[groupIndex - 1];

    console.log('testing group', groupIndex, fixtures);
  }

  for (const fixture of fixtures) {
    it.concurrent(`should build ${fixture}`, async () => {
      await expect(
        testDeployment(path.join(fixturesPath, fixture))
      ).resolves.toBeDefined();
    });
  }
};
