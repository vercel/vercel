/* global it, expect */
const path = require('path');
const runBuildLambda = require('../../lib/run-build-lambda');

const FOUR_MINUTES = 240000;

it(
  'Should build the standard example',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'standard'),
    );
    expect(buildResult.index).toBeDefined();
    const filePaths = Object.keys(buildResult);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_app\.js$/));
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_error\.js$/));
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES,
);

it(
  'Should build the monorepo example',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'monorepo'),
    );
    expect(buildResult['www/index']).toBeDefined();
    expect(buildResult['www/static/test.txt']).toBeDefined();
    const filePaths = Object.keys(buildResult);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_app\.js$/));
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_error\.js$/));
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES,
);

it(
  'Should build the legacy standard example',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'legacy-standard'),
    );
    expect(buildResult.index).toBeDefined();
    const filePaths = Object.keys(buildResult);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_app\.js$/));
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_error\.js$/));
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES,
);

it(
  'Should build the legacy custom dependency test',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'legacy-custom-dependency'),
    );
    expect(buildResult.index).toBeDefined();
  },
  FOUR_MINUTES,
);

it('Should throw when package.json or next.config.js is not the "src"', async () => {
  try {
    await runBuildLambda(
      path.join(__dirname, 'no-package-json-and-next-config'),
    );
    throw new Error('did not throw');
  } catch (err) {
    expect(err.message).toMatch(/package\.json/);
  }
});

it(
  'Should build the static-files test on legacy',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'legacy-static-files'),
    );
    expect(buildResult['static/test.txt']).toBeDefined();
  },
  FOUR_MINUTES,
);

it(
  'Should build the static-files test',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'static-files'),
    );
    expect(buildResult['static/test.txt']).toBeDefined();
  },
  FOUR_MINUTES,
);
