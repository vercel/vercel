process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

it('Should build the 404-getstaticprops example', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, '404-getstaticprops')
  );
  const { output } = buildResult;

  expect(output['404']).toBeDefined();
  expect(output['404'].type).toBe('FileFsRef');
  expect(output['404'].allowQuery).toBe(undefined);
  expect(output['_next/data/testing-build-id/404.json']).toBeDefined();
  expect(output['_next/data/testing-build-id/404.json'].type).toBe('FileFsRef');
  expect(output['_next/data/testing-build-id/404.json'].allowQuery).toBe(
    undefined
  );
  const filePaths = Object.keys(output);
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();
});

it('should build initial beforeFiles rewrites', async () => {
  const {
    buildResult: { output, routes },
  } = await runBuildLambda(
    path.join(__dirname, 'initial-before-files-rewrite')
  );

  expect(output['index']).toBeDefined();
  expect(output['another']).toBeDefined();
  expect(output['dynamic/[slug]']).toBeDefined();
  expect(output['fallback/[slug]']).toBeDefined();
  expect(output['api']).toBeDefined();
  expect(output['api/another']).toBeDefined();
  expect(output['api/blog/[slug]']).toBeDefined();
  expect(output['_app']).not.toBeDefined();
  expect(output['_error']).not.toBeDefined();
  expect(output['_document']).not.toBeDefined();

  const rewriteRoute = routes.find(route => {
    return route.dest === '/somewhere';
  });

  expect(rewriteRoute.check).toBe(true);
  expect(rewriteRoute.continue).toBeUndefined();
});

it('Should build the legacy custom dependency test', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'legacy-custom-dependency'));
  expect(output.index).toBeDefined();
});

it('should show error from basePath with legacy monorepo build', async () => {
  let error;

  try {
    await runBuildLambda(path.join(__dirname, 'legacy-monorepo-basepath'));
  } catch (err) {
    error = err;
  }
  console.error(error);

  expect(error.message).toBe(
    'basePath can not be used with `builds` in vercel.json, use Project Settings to configure your monorepo instead'
  );
});

it('Should build the legacy standard example', async () => {
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
});

it('Should build the static-files test on legacy', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'legacy-static-files'));
  expect(output['static/test.txt']).toBeDefined();
});

it('Should build the monorepo example', async () => {
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
});

it('Should build the public-files test', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'public-files'));
  expect(output['robots.txt']).toBeDefined();
  expect(output['generated.txt']).toBeDefined();
});

it('Should build the serverless-config example', async () => {
  const {
    workPath,
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'serverless-config'));

  expect(output.index).not.toBeDefined();
  expect(output.goodbye).not.toBeDefined();
  expect(output.__NEXT_PAGE_LAMBDA_0).toBeDefined();
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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
});

it('Should build the serverless-config-monorepo-missing example', async () => {
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
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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
});

it('Should build the serverless-config-monorepo-present example', async () => {
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
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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
});

it('Should opt-out of shared lambdas when routes are detected', async () => {
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
});

it('Should build the serverless-config-async example', async () => {
  let error = null;

  try {
    await runBuildLambda(path.join(__dirname, 'serverless-config-async'));
  } catch (err) {
    error = err;
  }

  expect(error).toBe(null);
});

it('Should provide lambda info when limit is hit (shared lambdas)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  try {
    await runBuildLambda(
      path.join(__dirname, 'test-limit-exceeded-shared-lambdas')
    );
  } catch (err) {
    console.error(err);
  }
  console.log = origLog;

  expect(logs).toContain(
    'Max serverless function size was exceeded for 1 function'
  );
  expect(logs).toContain(
    'Max serverless function size of 50 MB compressed or 250 MB uncompressed reached'
  );
  expect(logs).toContain(`Serverless Function's page: api/both.js`);
  expect(logs).toMatch(
    /Large Dependencies.*?Uncompressed size.*?Compressed size/
  );
  expect(logs).toMatch(
    /node_modules\/chrome-aws-lambda\/bin.*?\d{2}.*?MB.*?\d{2}.*?MB/
  );
  expect(logs).toMatch(/node_modules\/@firebase\/firestore.*?\d{1}.*?MB/);
});
