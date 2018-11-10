/* global it, expect */
const path = require('path');
const runBuildLambda = require('../../lib/run-build-lambda');

const TWO_MINUTES = 120000;

it('Should build the standard example', async () => {
  const { buildResult } = await runBuildLambda(path.join(__dirname, 'standard'));
  expect(buildResult.index).toBeDefined();
  const filePaths = Object.keys(buildResult);
  const hasUnderScoreAppStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_app\.js$/));
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_error\.js$/));
  expect(hasUnderScoreAppStaticFile).toBeTruthy();
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();
}, TWO_MINUTES);

it('Should throw when package.json or next.config.js is not the "src"', async () => {
  try {
    await runBuildLambda(path.join(__dirname, 'no-package-json-and-next-config'));
  } catch (err) {
    expect(err.message).toMatch(/package\.json/);
  }
});
