process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');
const { duplicateWithConfig } = require('../utils');
const { streamToBuffer } = require('@vercel/build-utils');
const { createHash } = require('crypto');

const runBuildLambda = createRunBuildLambda(builder);

const SIMPLE_PROJECT = path.resolve(
  __dirname,
  '..',
  'fixtures',
  '00-middleware'
);

jest.setTimeout(360000);

function sharedTests(ctx) {
  it('worker uses `middleware` or `middlewarePath` keyword as route path', async () => {
    const routes = ctx.buildResult.routes.filter(
      route => 'middleware' in route || 'middlewarePath' in route
    );
    expect(
      routes.every(
        route =>
          route.missing[0].type === 'header' &&
          route.missing[0].key === 'x-prerender-revalidate' &&
          route.missing[0].value.length > 0
      )
    ).toBeTruthy();
    expect(routes.length).toBeGreaterThan(0);
  });
}

async function hashAllFiles(files) {
  const hash = createHash('sha1');

  for (const [pathname, file] of Object.entries(files)) {
    hash.update(`pathname:${pathname}`);
    const buffer = await streamToBuffer(file.toStream());
    hash.update(buffer);
  }

  return hash.digest('hex');
}

// experimental appDir currently requires Node.js >= 16
if (parseInt(process.versions.node.split('.')[0], 10) >= 16) {
  it('should build with app-dir correctly', async () => {
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

    const { buildResult } = await runBuildLambda(
      path.join(__dirname, '../fixtures/00-app-dir-no-ppr')
    );

    console.log = origLog;
    console.error = origError;

    const lambdas = new Set();

    for (const key of Object.keys(buildResult.output)) {
      if (buildResult.output[key].type === 'Lambda') {
        lambdas.add(buildResult.output[key]);
      }
    }

    expect(
      buildResult.routes.some(
        route =>
          route.src?.includes('_next/data') && route.src?.includes('.rsc')
      )
    ).toBeFalsy();

    expect(lambdas.size).toBe(6);

    // RSC, root-level page.js
    expect(buildResult.output['index']).toBeDefined();
    expect(buildResult.output['index'].type).toBe('Prerender');
    expect(buildResult.output['index'].lambda.memory).toBe(512);
    expect(buildResult.output['index'].lambda.maxDuration).toBe(5);

    expect(buildResult.output['dashboard']).toBeDefined();
    expect(buildResult.output['dashboard/another']).toBeDefined();
    expect(buildResult.output['dashboard/changelog']).toBeDefined();
    expect(buildResult.output['dashboard/deployments/[id]']).toBeDefined();

    // ensure that function configs are properly applied across pages & app dir outputs
    [
      // pages dir route handler
      'api/hello',
      // app dir route handler
      'api/hello-again',
      // app dir route handler inside of a group
      'api/hello-again/with-group',
      // server component inside of a group
      'dynamic-group/[slug]',
      'dynamic-group/[slug].rsc',
      // server component
      'dynamic/[category]/[id]',
      'dynamic/[category]/[id].rsc',
    ].forEach(fnKey => {
      expect(buildResult.output[fnKey]).toBeDefined();
      expect(buildResult.output[fnKey].type).toBe('Lambda');
      expect(buildResult.output[fnKey].memory).toBe(512);
      expect(buildResult.output[fnKey].maxDuration).toBe(5);
    });

    expect(
      buildResult.output['api/hello-again'].supportsResponseStreaming
    ).toBe(true);

    expect(buildResult.output['edge-route-handler']).toBeDefined();
    expect(buildResult.output['edge-route-handler'].type).toBe('EdgeFunction');

    // prefixed static generation output with `/app` under dist server files
    expect(buildResult.output['dashboard'].type).toBe('Prerender');
    expect(buildResult.output['dashboard'].fallback.fsPath).toMatch(
      /server\/app\/dashboard\.html$/
    );
    expect(buildResult.output['dashboard.rsc'].type).toBe('Prerender');
    expect(buildResult.output['dashboard.rsc'].fallback.fsPath).toMatch(
      /server\/app\/dashboard\.rsc$/
    );

    expect(
      caughtLogs.some(log =>
        log.includes('WARNING: Unable to find source file for page')
      )
    ).toBeFalsy();
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

  it('should build with app-dir with segment options correctly', async () => {
    const { buildResult } = await runBuildLambda(
      path.join(__dirname, '../fixtures/00-app-dir-segment-options')
    );

    const lambdas = new Set();

    for (const key of Object.keys(buildResult.output)) {
      if (buildResult.output[key].type === 'Lambda') {
        lambdas.add(buildResult.output[key]);
      }
    }

    expect(
      buildResult.routes.some(
        route =>
          route.src?.includes('_next/data') && route.src?.includes('.rsc')
      )
    ).toBeFalsy();

    expect(lambdas.size).toBe(2);

    expect(buildResult.output['api/hello']).toBeDefined();
    expect(buildResult.output['api/hello'].type).toBe('Lambda');
    expect(buildResult.output['api/hello'].maxDuration).toBe(7);

    expect(buildResult.output['api/hello-again']).toBeDefined();
    expect(buildResult.output['api/hello-again'].type).toBe('Lambda');
    expect(buildResult.output['api/hello-again'].maxDuration).toBe(7);
    expect(
      buildResult.output['api/hello-again'].supportsResponseStreaming
    ).toBe(true);
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

it('Should build the serverless-config-async example', async () => {
  await runBuildLambda(path.join(__dirname, 'serverless-config-async'));
});

describe('Middleware simple project', () => {
  const ctx = {};

  beforeAll(async () => {
    const result = await runBuildLambda(SIMPLE_PROJECT);
    ctx.buildResult = result.buildResult;
  });

  it('orders middleware route correctly', async () => {
    const middlewareIndex = ctx.buildResult.routes.findIndex(item => {
      return !!item.middlewarePath;
    });
    const redirectIndex = ctx.buildResult.routes.findIndex(item => {
      return item.src && item.src.includes('redirect-me');
    });
    const beforeFilesIndex = ctx.buildResult.routes.findIndex(item => {
      return item.src && item.src.includes('rewrite-before-files');
    });
    const handleFileSystemIndex = ctx.buildResult.routes.findIndex(item => {
      return item.handle === 'filesystem';
    });
    expect(typeof middlewareIndex).toBe('number');
    expect(typeof redirectIndex).toBe('number');
    expect(typeof beforeFilesIndex).toBe('number');
    expect(redirectIndex).toBeLessThan(middlewareIndex);
    expect(redirectIndex).toBeLessThan(beforeFilesIndex);
    expect(middlewareIndex).toBeLessThan(beforeFilesIndex);
    expect(middlewareIndex).toBeLessThan(handleFileSystemIndex);
  });

  it('generates deterministic code', async () => {
    const result = await runBuildLambda(SIMPLE_PROJECT);
    const output = Object.entries(result.buildResult.output).filter(pair => {
      return pair[1].type === 'EdgeFunction';
    });

    expect(output.length).toBeGreaterThanOrEqual(1);

    for (const [key, ef1] of output) {
      const ef2 = result.buildResult.output[key];
      if (ef2.type !== 'EdgeFunction') {
        throw new Error(`${key} is not an EdgeFunction`);
      }

      const [hash1, hash2] = await Promise.all([
        hashAllFiles(ef1.files),
        hashAllFiles(ef2.files),
      ]);
      expect(hash1).toEqual(hash2);
    }
  });

  sharedTests(ctx);
});

describe('Middleware with basePath', () => {
  let projectPath;
  const context = {
    basePath: '/root',
  };

  beforeAll(async () => {
    projectPath = await duplicateWithConfig({
      context: context,
      path: SIMPLE_PROJECT,
      suffix: 'basepath',
    });

    const result = await runBuildLambda(projectPath);
    context.buildResult = result.buildResult;
  });

  afterAll(async () => {
    await fs.remove(projectPath);
  });

  sharedTests(context);
});
