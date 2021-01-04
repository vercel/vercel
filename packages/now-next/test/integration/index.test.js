const path = require('path');
const fs = require('fs-extra');
const runBuildLambda = require('../../../../test/lib/run-build-lambda');

const FOUR_MINUTES = 240000;

beforeAll(() => {
  process.env.NEXT_TELEMETRY_DISABLED = '1';
});

it(
  'Should build the standard example',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'standard'));
    expect(output['index']).toBeDefined();
    expect(output.goodbye).not.toBeDefined();
    expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app-.*\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error-.*\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the gip-gsp-404 example',
  async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, 'gip-gsp-404')
    );
    const { output, routes } = buildResult;

    let handleErrorIdx = -1;

    (routes || []).some((route, idx) => {
      if (route.handle === 'error') {
        handleErrorIdx = idx;
        return true;
      }
    });
    expect(routes[handleErrorIdx + 1].dest).toBe('/404');
    expect(routes[handleErrorIdx + 1].headers).toBe(undefined);
    expect(output.goodbye).not.toBeDefined();
    expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
    expect(output['404']).toBeDefined();
    expect(output['404'].type).toBe('FileFsRef');
    expect(output['_next/data/testing-build-id/404.json']).toBeDefined();
    expect(output['_next/data/testing-build-id/404.json'].type).toBe(
      'FileFsRef'
    );
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app-.*\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error-.*\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should not deploy preview lambdas for static site',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'static-site'));
    expect(output['index']).toBeDefined();
    expect(output['index'].type).toBe('FileFsRef');

    expect(output['another']).toBeDefined();

    expect(output['another'].type).toBe('FileFsRef');

    expect(output['dynamic']).toBeDefined();
    expect(output['dynamic'].type).toBe('Prerender');
    expect(output['dynamic'].lambda).toBeDefined();
  },
  FOUR_MINUTES
);

it(
  'Should opt-out of shared lambdas when routes are detected',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(
      path.join(__dirname, '../fixtures/26-mono-repo-404-lambda')
    );
    expect(output['packages/webapp/404']).toBeDefined();
    expect(output['packages/webapp/index']).toBeDefined();
    expect(output['packages/webapp/__NEXT_PAGE_LAMBDA_0']).not.toBeDefined();
    const filePaths = Object.keys(output);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the monorepo example',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'monorepo'));

    expect(output['www/index']).not.toBeDefined();
    expect(output['www/__NEXT_PAGE_LAMBDA_0']).toBeDefined();
    expect(output['www/static/test.txt']).toBeDefined();
    expect(output['www/data.txt']).toBeDefined();
    const filePaths = Object.keys(output);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the legacy standard example',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'legacy-standard'));
    expect(output.index).toBeDefined();
    const filePaths = Object.keys(output);
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the legacy custom dependency test',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'legacy-custom-dependency'));
    expect(output.index).toBeDefined();
  },
  FOUR_MINUTES
);

it('Should throw when package.json or next.config.js is not the "src"', async () => {
  try {
    await runBuildLambda(
      path.join(__dirname, 'no-package-json-and-next-config')
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
  FOUR_MINUTES
);

it(
  'Should build the static-files test',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'static-files'));
    expect(output['static/test.txt']).toBeDefined();
  },
  FOUR_MINUTES
);

it(
  'Should build the public-files test',
  async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'public-files'));
    expect(output['robots.txt']).toBeDefined();
    expect(output['generated.txt']).toBeDefined();
  },
  FOUR_MINUTES
);

it(
  'Should build the serverless-config example',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'serverless-config'));

    expect(output.index).not.toBeDefined();
    expect(output.goodbye).not.toBeDefined();
    expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
    expect(
      contents.some(name =>
        name.includes('next.config.__vercel_builder_backup__')
      )
    ).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the serverless-config-monorepo-missing example',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(
      path.join(__dirname, 'serverless-config-monorepo-missing')
    );

    expect(output['nested/index']).not.toBeDefined();
    expect(output['nested/goodbye']).not.toBeDefined();
    expect(output['nested/__NEXT_PAGE_LAMBDA_0']).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();

    const contents = await fs.readdir(path.join(workPath, 'nested'));

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the serverless-config-monorepo-present example',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(
      path.join(__dirname, 'serverless-config-monorepo-present')
    );

    expect(output['nested/index']).not.toBeDefined();
    expect(output['nested/goodbye']).not.toBeDefined();
    expect(output['nested/__NEXT_PAGE_LAMBDA_0']).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();

    const contents = await fs.readdir(path.join(workPath, 'nested'));

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
    expect(
      contents.some(name =>
        name.includes('next.config.__vercel_builder_backup__')
      )
    ).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should not build the serverless-config-async example',
  async () => {
    let error = null;

    try {
      await runBuildLambda(path.join(__dirname, 'serverless-config-async'));
    } catch (err) {
      error = err;
    }

    expect(error).not.toBe(null);
  },
  FOUR_MINUTES
);

it(
  'Should not build the serverless-config-promise example',
  async () => {
    let error = null;

    try {
      await runBuildLambda(path.join(__dirname, 'serverless-config-promise'));
    } catch (err) {
      error = err;
    }

    expect(error).not.toBe(null);
  },
  FOUR_MINUTES
);

it(
  'Should build the serverless-config-object example',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'serverless-config-object'));

    expect(output['index']).toBeDefined();
    expect(output.goodbye).not.toBeDefined();
    expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app-.*\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error-.*\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
    expect(
      contents.some(name =>
        name.includes('next.config.__vercel_builder_backup__')
      )
    ).toBeTruthy();
  },
  FOUR_MINUTES
);

it(
  'Should build the serverless-no-config example',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'serverless-no-config'));

    expect(output['index']).toBeDefined();
    expect(output.goodbye).not.toBeDefined();
    expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app-.*\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error-.*\.js$/)
    );
    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
    expect(
      contents.some(name =>
        name.includes('next.config.__vercel_builder_backup__')
      )
    ).toBeFalsy();
  },
  FOUR_MINUTES
);

it(
  'Should invoke build command with serverless-no-config',
  async () => {
    const {
      workPath,
      buildResult: { output },
    } = await runBuildLambda(
      path.join(__dirname, 'serverless-no-config-build')
    );

    expect(output['index']).toBeDefined();
    const filePaths = Object.keys(output);
    const serverlessError = filePaths.some(filePath =>
      filePath.match(/_error/)
    );
    const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_app-.*\.js$/)
    );
    const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
      filePath.match(/static.*\/pages\/_error-.*\.js$/)
    );
    const hasBuildFile = await fs.pathExists(
      path.join(__dirname, 'serverless-no-config-build'),
      '.next',
      'world.txt'
    );

    expect(hasUnderScoreAppStaticFile).toBeTruthy();
    expect(hasUnderScoreErrorStaticFile).toBeTruthy();
    expect(serverlessError).toBeTruthy();
    expect(hasBuildFile).toBeTruthy();

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'next.config.js')).toBeTruthy();
    expect(
      contents.some(name =>
        name.includes('next.config.__vercel_builder_backup__')
      )
    ).toBeFalsy();
  },
  FOUR_MINUTES
);
