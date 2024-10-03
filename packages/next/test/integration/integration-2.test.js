process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const fs = require('fs-extra');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

jest.setTimeout(360000);

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
    'Max serverless function size of 250 MB uncompressed reached'
  );
  expect(logs).toContain(`Serverless Function's page: api/both.js`);
  expect(logs).toMatch(/Large Dependencies.*?Uncompressed size/);
  expect(logs).toMatch(/node_modules\/chrome-aws-lambda\/bin.*?\d{2}.*?MB/);
  expect(logs).toMatch(/node_modules\/@firebase\/firestore.*?\d{1}.*?MB/);
  expect(logs).toMatch(/big-image-1/);
  expect(logs).toMatch(/big-image-2/);
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
    'Max serverless function size of 250 MB uncompressed reached'
  );
  // expect(logs).toContain(`Serverless Function's page: api/firebase.js`);
  expect(logs).toContain(`Serverless Function's page: api/chrome.js`);
  expect(logs).toContain(`Serverless Function's page: api/both.js`);
  expect(logs).toMatch(/Large Dependencies.*?Uncompressed size/);
  expect(logs).toMatch(/node_modules\/chrome-aws-lambda\/bin.*?\d{2}.*?MB/);
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
    'Max serverless function size of 250 MB uncompressed reached'
  );
  expect(logs).toContain(`Serverless Function's page: api/hello.js`);
  expect(logs).toMatch(/Large Dependencies.*?Uncompressed size/);
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

it('should handle edge functions in app with basePath', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'edge-app-dir-basepath'));

  console.error(output);

  expect(output['test']).toBeDefined();
  expect(output['test']).toBeDefined();
  expect(output['test'].type).toBe('EdgeFunction');
  expect(output['test'].type).toBe('EdgeFunction');

  expect(output['test/another']).toBeDefined();
  expect(output['test/another.rsc']).toBeDefined();
  expect(output['test/another'].type).toBe('EdgeFunction');
  expect(output['test/another.rsc'].type).toBe('EdgeFunction');

  expect(output['test/dynamic/[slug]']).toBeDefined();
  expect(output['test/dynamic/[slug].rsc']).toBeDefined();
  expect(output['test/dynamic/[slug]'].type).toBe('EdgeFunction');
  expect(output['test/dynamic/[slug].rsc'].type).toBe('EdgeFunction');

  expect(output['test/dynamic/[slug]']).toBeDefined();
  expect(output['test/dynamic/[slug].rsc']).toBeDefined();
  expect(output['test/dynamic/[slug]'].type).toBe('EdgeFunction');
  expect(output['test/dynamic/[slug].rsc'].type).toBe('EdgeFunction');

  expect(output['test/test']).toBeDefined();
  expect(output['test/test.rsc']).toBeDefined();
  expect(output['test/test'].type).toBe('EdgeFunction');
  expect(output['test/test.rsc'].type).toBe('EdgeFunction');

  expect(output['test/_not-found']).toBeDefined();
  expect(output['test/_not-found'].type).toBe('Lambda');

  const lambdas = new Set();
  const edgeFunctions = new Set();

  for (const item of Object.values(output)) {
    if (item.type === 'Lambda') {
      lambdas.add(item);
    } else if (item.type === 'EdgeFunction') {
      edgeFunctions.add(item);
    }
  }
  expect(lambdas.size).toBe(1);
  expect(edgeFunctions.size).toBe(4);
});

it('should not generate lambdas that conflict with static index route in app with basePath', async () => {
  const {
    buildResult: { output },
  } = await runBuildLambda(path.join(__dirname, 'app-router-basepath'));

  expect(output['test']).not.toBeDefined();
  expect(output['test.rsc']).not.toBeDefined();
  expect(output['test/index'].type).toBe('Prerender');
  expect(output['test/index.rsc'].type).toBe('Prerender');

  expect(output['test/_not-found']).toBeDefined();
  expect(output['test/_not-found'].type).toBe('Lambda');

  const lambdas = new Set();

  for (const item of Object.values(output)) {
    if (item.type === 'Lambda') {
      lambdas.add(item);
    }
  }
  expect(lambdas.size).toBe(1);
});

describe('PPR', () => {
  describe('legacy', () => {
    it('should have the same lambda for revalidation and resume', async () => {
      const {
        buildResult: { output },
      } = await runBuildLambda(path.join(__dirname, 'ppr-legacy'));

      // Validate that there are only the two lambdas created.
      const lambdas = new Set();
      for (const key of Object.keys(output)) {
        if (output[key].type === 'Lambda') {
          lambdas.add(output[key]);
        }
      }

      expect(lambdas.size).toBe(2);

      // Validate that these two lambdas are the same.
      expect(output['index']).toBeDefined();
      expect(output['index'].type).toBe('Prerender');
      expect(output['index'].lambda).toBeDefined();
      expect(output['index'].lambda.type).toBe('Lambda');

      expect(output['_next/postponed/resume/index']).toBeDefined();
      expect(output['_next/postponed/resume/index'].type).toBe('Lambda');

      expect(output['index'].lambda).toBe(
        output['_next/postponed/resume/index']
      );
    });

    it('should support basePath', async () => {
      const {
        buildResult: { output },
      } = await runBuildLambda(path.join(__dirname, 'ppr-legacy-basepath'));

      // Validate that there are only the two lambdas created.
      const lambdas = new Set();
      for (const key of Object.keys(output)) {
        if (output[key].type === 'Lambda') {
          lambdas.add(output[key]);
        }
      }

      expect(lambdas.size).toBe(2);

      // Validate that these two lambdas are the same.
      expect(output['chat/index']).toBeDefined();
      expect(output['chat/index'].type).toBe('Prerender');
      expect(output['chat/index'].lambda).toBeDefined();
      expect(output['chat/index'].lambda.type).toBe('Lambda');

      expect(output['chat/_next/postponed/resume/index']).toBeDefined();
      expect(output['chat/_next/postponed/resume/index'].type).toBe('Lambda');

      expect(output['chat/index'].lambda).toBe(
        output['chat/_next/postponed/resume/index']
      );
      expect(output['chat/index'].experimentalStreamingLambdaPath).toBe(
        'chat/_next/postponed/resume/index'
      );
      expect(output['chat/index'].chain?.outputPath).toBe(
        'chat/_next/postponed/resume/index'
      );
      expect(output['chat/index'].chain?.headers).toEqual({
        'x-matched-path': '_next/postponed/resume/index',
      });
    });
  });

  it('should have the chain mirrored to the experimentalStreamingLambdaPath', async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'ppr'));

    // Validate that there are only the two lambdas created.
    const lambdas = new Set();
    for (const key of Object.keys(output)) {
      if (output[key].type === 'Lambda') {
        lambdas.add(output[key]);
      }
    }

    expect(lambdas.size).toBe(2);

    expect(output['index']).toBeDefined();
    expect(output['index'].type).toBe('Prerender');
    expect(output['index'].chain?.outputPath).toBe('index');

    // TODO: remove the following once we have stabilized the chained responses
    expect(output['index'].experimentalStreamingLambdaPath).toBe(
      '_next/postponed/resume/index'
    );
    expect(output['_next/postponed/resume/index']).toBeDefined();
  });

  it('should support basePath', async () => {
    const {
      buildResult: { output },
    } = await runBuildLambda(path.join(__dirname, 'ppr-basepath'));

    // Validate that there are only the two lambdas created.
    const lambdas = new Set();
    for (const key of Object.keys(output)) {
      if (output[key].type === 'Lambda') {
        lambdas.add(output[key]);
      }
    }

    expect(lambdas.size).toBe(2);

    // Validate that these two lambdas are the same.
    expect(output['chat/index']).toBeDefined();
    expect(output['chat/index'].type).toBe('Prerender');
    expect(output['chat/index'].lambda).toBeDefined();
    expect(output['chat/index'].lambda.type).toBe('Lambda');

    expect(output['chat/index'].chain?.outputPath).toBe('chat/index');

    // TODO: remove the following once we have stabilized the chained responses
    expect(output['chat/index'].experimentalStreamingLambdaPath).toBe(
      'chat/_next/postponed/resume/index'
    );
    expect(output['chat/_next/postponed/resume/index']).toBeDefined();
    expect(output['chat/_next/postponed/resume/index'].type).toBe('Lambda');
    expect(output['chat/_next/postponed/resume/index']).toBe(
      output['chat/index'].lambda
    );

    expect(output['chat/index'].chain?.outputPath).toBe('chat/index');
    expect(output['chat/index'].chain?.headers).toEqual({
      'next-resume': '1',
    });
  });
});
