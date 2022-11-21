const fs = require('fs');
const path = require('path');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(5 * 60 * 1000);

const fixturesPath = path.resolve(__dirname, 'fixtures');

const testsThatFailToBuild = new Map([
  [
    '11-version-2-5-error',
    'Found `Gemfile` with discontinued Ruby version: `ruby "~> 2.5.x".` Please set `ruby "~> 2.7.x"` in your `Gemfile` to use Ruby 2.7.x.',
  ],
]);

const testsThatShouldBeSkipped = ['06-rails'];

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  const shouldSkip = testsThatShouldBeSkipped.includes(fixture);
  if (shouldSkip) {
    console.log(`Skipping: ${fixture}`);
    continue;
  }

  const errMsg = testsThatFailToBuild.get(fixture);
  if (errMsg) {
    // eslint-disable-next-line no-loop-func
    it(`should fail to build ${fixture}`, async () => {
      try {
        await testDeployment(path.join(fixturesPath, fixture));
      } catch (err) {
        expect(err).toBeTruthy();
        expect(err.deployment).toBeTruthy();
        expect(err.deployment.errorMessage).toBe(errMsg);
      }
    });
    continue; //eslint-disable-line
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
