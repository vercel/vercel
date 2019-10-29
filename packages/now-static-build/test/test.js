const fs = require('fs');
const path = require('path');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(12 * 60 * 1000);
let builderUrl;

beforeAll(async () => {
  builderUrl = await packAndDeploy(path.resolve(__dirname, '..'));
  console.log('builderUrl', builderUrl);
});

const fixturesThatShouldFail = [
  '04-wrong-dist-dir',
  '05-empty-dist-dir',
  '06-missing-script',
  '07-nonzero-sh',
];

const fixturesPath = path.resolve(__dirname, 'fixtures');
const fixtures = fs.readdirSync(fixturesPath);

test.each(
  fixtures.map(fixture => {
    return [fixture, fixturesThatShouldFail.includes(fixture)];
  })
)(`testing %s (shouldFail is %p)`, async (fixture, shouldFail) => {
  const p = testDeployment({ builderUrl }, path.join(fixturesPath, fixture));

  if (shouldFail) {
    expect(p).rejects.toThrowError(/is ERROR/);
  } else {
    expect(p).resolves.toBeDefined();
  }
});
