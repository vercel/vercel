/* global it, expect */
const path = require('path');
const runBuildLambda = require('../../../../test/lib/run-build-lambda');

const FOUR_MINUTES = 240000;

it(
  'Should build the standard example',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'standard'));
    expect(output.index).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
    const hasUnderScoreAppStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_app\.js$/));
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath => filePath.match(/static.*\/pages\/_error\.js$/));
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();
  },
  FOUR_MINUTES,
);

it(
  'Should build the monorepo example',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'monorepo'));
    expect(output['www/index']).toBeDefined();
    expect(output['www/static/test.txt']).toBeDefined();
    expect(output['www/data.txt']).toBeDefined();
    const filePaths = Object.keys(output);
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
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'legacy-standard'));
    expect(output.index).toBeDefined();
    const filePaths = Object.keys(output);
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
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'legacy-custom-dependency'));
    expect(output.index).toBeDefined();
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
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'legacy-static-files'));
    expect(output['static/test.txt']).toBeDefined();
  },
  FOUR_MINUTES,
);

it(
  'Should build the static-files test',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'static-files'));
    expect(output['static/test.txt']).toBeDefined();
  },
  FOUR_MINUTES,
);

it(
  'Should build the public-files test',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'public-files'));
    expect(output['robots.txt']).toBeDefined();
  },
  FOUR_MINUTES,
);
