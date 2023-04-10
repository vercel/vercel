process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

// experimental appDir currently requires Node.js >= 16
if (parseInt(process.versions.node.split('.')[0], 10) >= 16) {
  it('should build with app-dir correctly', async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, '../fixtures/00-app-dir')
    );

    const lambdas = new Set();

    for (const key of Object.keys(buildResult.output)) {
      if (buildResult.output[key].type === 'Lambda') {
        lambdas.add(buildResult.output[key]);
      }
    }

    expect(lambdas.size).toBe(2);
    expect(buildResult.output['dashboard']).toBeDefined();
    expect(buildResult.output['dashboard/another']).toBeDefined();
    expect(buildResult.output['dashboard/changelog']).toBeDefined();
    expect(buildResult.output['dashboard/deployments/[id]']).toBeDefined();

    expect(buildResult.output['api/hello-again']).toBeDefined();
    expect(buildResult.output['api/hello-again'].type).toBe('Lambda');
    expect(
      buildResult.output['api/hello-again'].supportsResponseStreaming
    ).toBe(true);

    expect(buildResult.output['edge-route-handler']).toBeDefined();
    expect(buildResult.output['edge-route-handler'].type).toBe('EdgeFunction');
    expect(buildResult.output['edge-route-handler.rsc']).not.toBeDefined();

    // prefixed static generation output with `/app` under dist server files
    expect(buildResult.output['dashboard'].type).toBe('Prerender');
    expect(buildResult.output['dashboard'].fallback.fsPath).toMatch(
      /server\/app\/dashboard\.html$/
    );
    expect(buildResult.output['dashboard.rsc'].type).toBe('Prerender');
    expect(buildResult.output['dashboard.rsc'].fallback.fsPath).toMatch(
      /server\/app\/dashboard\.rsc$/
    );
    // TODO: re-enable after index/index handling is corrected
    // expect(buildResult.output['dashboard/index/index'].type).toBe('Prerender');
    // expect(buildResult.output['dashboard/index/index'].fallback.fsPath).toMatch(
    //   /server\/app\/dashboard\/index\.html$/
    // );
    // expect(buildResult.output['dashboard/index.rsc'].type).toBe('Prerender');
    // expect(buildResult.output['dashboard/index.rsc'].fallback.fsPath).toMatch(
    //   /server\/app\/dashboard\/index\.rsc$/
    // );
  });

  it('should build with app-dir in edge runtime correctly', async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, '../fixtures/00-app-dir-edge')
    );

    const edgeFunctions = new Set();

    for (const key of Object.keys(buildResult.output)) {
      if (buildResult.output[key].type === 'EdgeFunction') {
        edgeFunctions.add(buildResult.output[key]);
      }
    }

    expect(edgeFunctions.size).toBe(3);
    expect(buildResult.output['edge']).toBeDefined();
    expect(buildResult.output['index']).toBeDefined();
    // expect(buildResult.output['index/index']).toBeDefined();
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
}

it('should build using server build', async () => {
  const origLog = console.log;
  const origError = console.error;
  const caughtLogs = [];

  console.log = function (...args) {
    caughtLogs.push(args.join(' '));
    origLog.apply(this, args);
  };
  console.error = function (...args) {
    caughtLogs.push(args.join(' '));
    origError.apply(this, args);
  };

  const {
    workPath,
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'server-build'));

  console.log = origLog;
  console.error = origError;
  // server mode should not use the next.config.js wrapping
  // for forcing the correct target
  expect(
    await fs.pathExists(
      path.join(workPath, 'next.config.__vercel_builder_backup__.js')
    )
  ).toBe(false);

  expect(await fs.pathExists(path.join(workPath, 'next.config.js'))).toBe(true);

  expect(output['index']).toBeDefined();
  expect(output['another']).toBeDefined();
  expect(output['dynamic/[slug]']).toBeDefined();
  expect(output['fallback/[slug]']).toBeDefined();
  expect(output['api']).toBeDefined();
  expect(output['api/another']).toBeDefined();
  expect(output['api/blog/[slug]']).toBeDefined();
  expect(output['static']).toBeDefined();
  expect(output['_app']).not.toBeDefined();
  expect(output['_error']).not.toBeDefined();
  expect(output['_document']).not.toBeDefined();

  expect(output['index'].type).toBe('Lambda');
  expect(output['index'].allowQuery).toBe(undefined);
  expect(output['index'].memory).toBe(512);
  expect(output['index'].maxDuration).toBe(5);
  expect(output['index'].operationType).toBe('Page');

  expect(output['another'].type).toBe('Lambda');
  expect(output['another'].memory).toBe(512);
  expect(output['another'].maxDuration).toBe(5);
  expect(output['another'].allowQuery).toBe(undefined);
  expect(output['another'].operationType).toBe('Page');

  expect(output['dynamic/[slug]'].type).toBe('Lambda');
  expect(output['dynamic/[slug]'].memory).toBe(undefined);
  expect(output['dynamic/[slug]'].maxDuration).toBe(5);
  expect(output['dynamic/[slug]'].operationType).toBe('Page');

  expect(output['fallback/[slug]'].type).toBe('Prerender');
  expect(output['fallback/[slug]'].allowQuery).toEqual(['nxtPslug']);
  expect(output['fallback/[slug]'].lambda.operationType).toBe('ISR');
  expect(output['fallback/[slug]'].sourcePath).toBe(undefined);

  expect(output['_next/data/testing-build-id/fallback/[slug].json'].type).toBe(
    'Prerender'
  );
  expect(
    output['_next/data/testing-build-id/fallback/[slug].json'].allowQuery
  ).toEqual(['nxtPslug']);
  expect(
    output['_next/data/testing-build-id/fallback/[slug].json'].lambda
      .operationType
  ).toBe('ISR');

  expect(output['fallback/first'].type).toBe('Prerender');
  expect(output['fallback/first'].allowQuery).toEqual([]);
  expect(output['fallback/first'].lambda.operationType).toBe('ISR');
  expect(output['fallback/first'].sourcePath).toBe('/fallback/[slug]');

  expect(output['_next/data/testing-build-id/fallback/first.json'].type).toBe(
    'Prerender'
  );
  expect(
    output['_next/data/testing-build-id/fallback/first.json'].allowQuery
  ).toEqual([]);
  expect(
    output['_next/data/testing-build-id/fallback/first.json'].lambda
      .operationType
  ).toBe('ISR');

  expect(output['api'].type).toBe('Lambda');
  expect(output['api'].allowQuery).toBe(undefined);
  expect(output['api'].memory).toBe(128);
  expect(output['api'].maxDuration).toBe(5);
  expect(output['api'].operationType).toBe('API');

  expect(output['api/another'].type).toBe('Lambda');
  expect(output['api/another'].allowQuery).toBe(undefined);
  expect(output['api/another'].operationType).toBe('API');

  expect(output['api/blog/[slug]'].type).toBe('Lambda');
  expect(output['api/blog/[slug]'].allowQuery).toBe(undefined);
  expect(output['api/blog/[slug]'].operationType).toBe('API');

  expect(output['static'].type).toBe('FileFsRef');
  expect(output['static'].allowQuery).toBe(undefined);
  expect(output['static'].operationType).toBe(undefined);

  expect(output['ssg'].type).toBe('Prerender');
  expect(output['ssg'].allowQuery).toEqual([]);
  expect(output['ssg'].lambda.operationType).toBe('ISR');
  expect(output['ssg'].sourcePath).toBe(undefined);

  expect(output['index'] === output['another']).toBe(true);
  expect(output['dynamic/[slug]'] !== output['fallback/[slug]'].lambda).toBe(
    true
  );
  expect(output['index'] !== output['dynamic/[slug]']).toBe(true);
  expect(output['api/another'] === output['api/blog/[slug]']).toBe(true);
  expect(output['api'] !== output['api/another']).toBe(true);
  expect(
    caughtLogs.some(log =>
      log.includes('WARNING: Unable to find source file for page')
    )
  ).toBeFalsy();

  const lambdas = new Set();
  let totalLambdas = 0;

  for (const item of Object.values(output)) {
    if (item.type === 'Lambda') {
      totalLambdas += 1;
      lambdas.add(item);
    } else if (item.type === 'Prerender') {
      lambdas.add(item.lambda);
      totalLambdas += 1;
    }
  }
  expect(lambdas.size).toBe(5);
  expect(lambdas.size).toBeLessThan(totalLambdas);
});

it('should build custom error lambda correctly', async () => {
  const {
    buildResult: { output, routes },
  } = await runBuildLambda(path.join(__dirname, 'custom-error-lambda'));

  expect(output['index']).toBeDefined();
  expect(output['index'].type).toBe('FileFsRef');
  expect(output['index'].allowQuery).toBe(undefined);

  expect(output['_error']).toBeDefined();
  expect(output['_error'].type).toBe('Lambda');
  expect(output['_error'].allowQuery).toBe(undefined);

  const notFoundRoute = routes.find(route => {
    return route.dest === '/_error' && route.status === 404;
  });

  expect(notFoundRoute).toBeTruthy();
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

it('Should build the standard example', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'standard'));
  expect(output['index']).toBeDefined();
  expect(output.goodbye).toBeDefined();
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
  const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_app-.*\.js$/)
  );
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreAppStaticFile).toBeTruthy();
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  expect(serverlessError).toBeTruthy();
});

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

it('Should build the 404-getstaticprops-i18n example', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, '404-getstaticprops-i18n')
  );
  const { output, routes } = buildResult;

  expect(output['en/404']).toBeDefined();
  expect(output['en/404'].type).toBe('FileFsRef');
  expect(output['en/404'].allowQuery).toBe(undefined);
  expect(output['_next/data/testing-build-id/en/404.json']).toBeDefined();
  expect(output['_next/data/testing-build-id/en/404.json'].type).toBe(
    'FileFsRef'
  );
  expect(output['_next/data/testing-build-id/en/404.json'].allowQuery).toBe(
    undefined
  );
  expect(output['fr/404']).toBeDefined();
  expect(output['fr/404'].type).toBe('FileFsRef');
  expect(output['fr/404'].allowQuery).toBe(undefined);
  expect(output['_next/data/testing-build-id/fr/404.json']).toBeDefined();
  expect(output['_next/data/testing-build-id/fr/404.json'].type).toBe(
    'FileFsRef'
  );
  expect(output['_next/data/testing-build-id/fr/404.json'].allowQuery).toBe(
    undefined
  );
  const filePaths = Object.keys(output);
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();

  const handleErrorIdx = (routes || []).findIndex(r => r.handle === 'error');
  expect(routes[handleErrorIdx + 1].dest).toBe('/$nextLocale/404');
  expect(routes[handleErrorIdx + 1].headers).toBe(undefined);
});

it('Should build the gip-gsp-404 example', async () => {
  const { buildResult } = await runBuildLambda(
    path.join(__dirname, 'gip-gsp-404')
  );
  const { output, routes } = buildResult;

  const handleErrorIdx = (routes || []).findIndex(r => r.handle === 'error');
  expect(routes[handleErrorIdx + 1].dest).toBe('/404');
  expect(routes[handleErrorIdx + 1].headers).toBe(undefined);
  expect(output['404']).toBeDefined();
  expect(output['404'].type).toBe('Prerender');
  expect(output['_next/data/testing-build-id/404.json']).toBeDefined();
  expect(output['_next/data/testing-build-id/404.json'].type).toBe('Prerender');
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
  const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_app-.*\.js$/)
  );
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreAppStaticFile).toBeTruthy();
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();
  expect(serverlessError).toBeTruthy();
});

it('Should not deploy preview lambdas for static site', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'static-site'));
  expect(output['index']).toBeDefined();
  expect(output['index'].type).toBe('FileFsRef');
  expect(output['index'].allowQuery).toBe(undefined);

  expect(output['another']).toBeDefined();
  expect(output['another'].type).toBe('FileFsRef');
  expect(output['another'].allowQuery).toBe(undefined);

  expect(output['dynamic']).toBeDefined();
  expect(output['dynamic'].type).toBe('Prerender');
  expect(output['dynamic'].allowQuery).toEqual([]);
  expect(output['dynamic'].lambda).toBeDefined();
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

it('Should build the legacy custom dependency test', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'legacy-custom-dependency'));
  expect(output.index).toBeDefined();
});

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

it('Should build the static-files test on legacy', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'legacy-static-files'));
  expect(output['static/test.txt']).toBeDefined();
});

it('Should build the static-files test', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'static-files'));
  expect(output['static/test.txt']).toBeDefined();
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

it('Should build the serverless-config-async example', async () => {
  let error = null;

  try {
    await runBuildLambda(path.join(__dirname, 'serverless-config-async'));
  } catch (err) {
    error = err;
  }

  expect(error).toBe(null);
});

it('Should build the serverless-config-promise example', async () => {
  let error = null;

  try {
    await runBuildLambda(path.join(__dirname, 'serverless-config-promise'));
  } catch (err) {
    error = err;
  }

  expect(error).toBe(null);
});

it('Should build the serverless-config-object example', async () => {
  const {
    workPath,
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'serverless-config-object'));

  expect(output['index']).toBeDefined();
  expect(output.goodbye).toBeDefined();
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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
});

it('Should build the serverless-no-config example', async () => {
  const {
    workPath,
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'serverless-no-config'));

  expect(output['index']).toBeDefined();
  expect(output.goodbye).toBeDefined();
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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

  expect(contents.some(name => name === 'next.config.js')).toBeFalsy();
  expect(
    contents.some(name =>
      name.includes('next.config.__vercel_builder_backup__')
    )
  ).toBeFalsy();
});

it('Should invoke build command with serverless-no-config', async () => {
  const {
    workPath,
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'serverless-no-config-build'));

  expect(output['index']).toBeDefined();
  const filePaths = Object.keys(output);
  const serverlessError = filePaths.some(filePath => filePath.match(/_error/));
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

  expect(contents.some(name => name === 'next.config.js')).toBeFalsy();
  expect(
    contents.some(name =>
      name.includes('next.config.__vercel_builder_backup__')
    )
  ).toBeFalsy();
});

// eslint-disable-next-line jest/no-disabled-tests
it.skip('Should not exceed function limit for large dependencies (server build)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  const {
    buildResult: { output },
  } = await runBuildLambda(
    path.join(__dirname, '../fixtures/00-test-limit-server-build')
  );
  console.log = origLog;

  expect(output['index']).toBeDefined();
  expect(output['api/chrome']).toBeDefined();
  expect(output['api/chrome-1']).toBeDefined();
  expect(output['api/firebase']).toBeDefined();
  expect(output['api/firebase-1']).toBeDefined();
  expect(output['gssp']).toBeDefined();
  expect(output['gssp-1']).toBeDefined();
  const filePaths = Object.keys(output);

  const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_app-.*\.js$/)
  );
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreAppStaticFile).toBeTruthy();
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();

  const lambdas = new Set();

  filePaths.forEach(filePath => {
    if (output[filePath].type === 'Lambda') {
      lambdas.add(output[filePath]);
    }
  });
  expect(lambdas.size).toBe(3);

  // this assertion is unstable as `next-server`'s size can change up and down
  // on canary so skipping to prevent random failures.
  // expect(logs).toContain(
  //   'Warning: Max serverless function size of 50 MB compressed or 250 MB uncompressed almost reached'
  // );

  expect(logs).toContain('node_modules/chrome-aws-lambda/bin');
});

// eslint-disable-next-line jest/no-disabled-tests
it.skip('Should not exceed function limit for large dependencies (shared lambda)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  const {
    buildResult: { output },
  } = await runBuildLambda(
    path.join(__dirname, '../fixtures/00-test-limit-shared-lambdas')
  );
  console.log = origLog;

  expect(output['index']).toBeDefined();
  expect(output['__NEXT_API_LAMBDA_0']).toBeDefined();
  expect(output['__NEXT_API_LAMBDA_1']).toBeDefined();
  expect(output['__NEXT_API_LAMBDA_2']).not.toBeDefined();
  expect(output['__NEXT_PAGE_LAMBDA_0']).toBeDefined();
  expect(output['__NEXT_PAGE_LAMBDA_1']).not.toBeDefined();

  const filePaths = Object.keys(output);

  const hasUnderScoreAppStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_app-.*\.js$/)
  );
  const hasUnderScoreErrorStaticFile = filePaths.some(filePath =>
    filePath.match(/static.*\/pages\/_error-.*\.js$/)
  );
  expect(hasUnderScoreAppStaticFile).toBeTruthy();
  expect(hasUnderScoreErrorStaticFile).toBeTruthy();

  const lambdas = new Set();

  filePaths.forEach(filePath => {
    if (output[filePath].type === 'Lambda') {
      lambdas.add(output[filePath]);
    }
  });
  expect(lambdas.size).toBe(3);

  expect(logs).toContain(
    'Warning: Max serverless function size of 50 MB compressed or 250 MB uncompressed almost reached'
  );
  expect(logs).toContain('node_modules/chrome-aws-lambda/bin');
});

it('Should provide lambda info when limit is hit (server build)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  try {
    await runBuildLambda(
      path.join(__dirname, 'test-limit-exceeded-server-build')
    );
  } catch (err) {
    console.error(err);
  }
  console.log = origLog;

  expect(logs).toContain(
    'Max serverless function size was exceeded for 2 functions'
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
  expect(logs).toMatch(/big-image-1/);
  expect(logs).toMatch(/big-image-2/);
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

it('Should provide lambda info when limit is hit for internal pages (server build)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  try {
    await runBuildLambda(
      path.join(__dirname, 'test-limit-exceeded-internal-files-server-build')
    );
  } catch (err) {
    console.error(err);
  }
  console.log = origLog;

  expect(logs).toContain(
    'Max serverless function size of 50 MB compressed or 250 MB uncompressed reached'
  );
  // expect(logs).toContain(`Serverless Function's page: api/firebase.js`);
  expect(logs).toContain(`Serverless Function's page: api/chrome.js`);
  expect(logs).toContain(`Serverless Function's page: api/both.js`);
  expect(logs).toMatch(
    /Large Dependencies.*?Uncompressed size.*?Compressed size/
  );
  expect(logs).toMatch(
    /node_modules\/chrome-aws-lambda\/bin.*?\d{2}.*?MB.*?\d{2}.*?MB/
  );
  expect(logs).toMatch(/node_modules\/@firebase\/firestore.*?\d{1}.*?MB/);
  expect(logs).toMatch(/public\/big-image-1\.jpg/);
  expect(logs).toMatch(/public\/big-image-2\.jpg/);
});

it('Should provide lambda info when limit is hit (uncompressed)', async () => {
  let logs = '';

  const origLog = console.log;

  console.log = function (...args) {
    logs += args.join(' ');
    origLog(...args);
  };

  try {
    await runBuildLambda(
      path.join(__dirname, 'test-limit-exceeded-404-static-files')
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
  expect(logs).toContain(`Serverless Function's page: api/hello.js`);
  expect(logs).toMatch(
    /Large Dependencies.*?Uncompressed size.*?Compressed size/
  );
  expect(logs).toMatch(/data\.txt/);
  expect(logs).toMatch(/\.next\/server\/pages/);
});

it('Should de-dupe correctly when limit is close (uncompressed)', async () => {
  const origLog = console.log;
  const origError = console.error;
  const caughtLogs = [];

  console.log = function (...args) {
    caughtLogs.push(args.join(' '));
    origLog.apply(this, args);
  };
  console.error = function (...args) {
    caughtLogs.push(args.join(' '));
    origError.apply(this, args);
  };

  const {
    buildResult: { output },
  } = await runBuildLambda(
    path.join(__dirname, 'test-limit-large-uncompressed-files')
  );

  console.log = origLog;
  console.error = origError;

  expect(output['index']).toBeDefined();
  expect(output['another']).toBeDefined();
  expect(output['api/hello']).toBeDefined();
  expect(output['api/hello-1']).toBeDefined();
  expect(output['api/hello-2']).toBeDefined();
  expect(output['api/hello-3']).toBeDefined();
  expect(output['api/hello-4']).toBeDefined();
  expect(output['_app']).not.toBeDefined();
  expect(output['_error']).not.toBeDefined();
  expect(output['_document']).not.toBeDefined();

  expect(output['index'] === output['another']).toBe(true);
  expect(output['index'] !== output['api/hello']).toBe(true);
  expect(output['api/hello'] === output['api/hello-1']).toBe(true);
  expect(output['api/hello'] === output['api/hello-2']).toBe(true);
  expect(output['api/hello'] === output['api/hello-3']).toBe(true);
  expect(output['api/hello'] === output['api/hello-4']).toBe(true);

  expect(
    caughtLogs.some(log =>
      log.includes('WARNING: Unable to find source file for page')
    )
  ).toBeFalsy();

  const lambdas = new Set();
  let totalLambdas = 0;

  for (const item of Object.values(output)) {
    if (item.type === 'Lambda') {
      totalLambdas += 1;
      lambdas.add(item);
    } else if (item.type === 'Prerender') {
      lambdas.add(item.lambda);
      totalLambdas += 1;
    }
  }
  expect(lambdas.size).toBe(2);
  expect(lambdas.size).toBeLessThan(totalLambdas);
});
