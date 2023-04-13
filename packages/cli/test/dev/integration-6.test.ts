const {
  fetch,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

describe('[vercel dev] ESM edge functions', () => {
  test(
    '[vercel dev] ESM .js type=module',
    testFixtureStdio(
      'esm-js-edge-module',
      async (_testPath: any, port: any) => {
        let res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=module',
    testFixtureStdio(
      'esm-ts-edge-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .js type=commonjs',
    testFixtureStdio(
      'esm-js-edge-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=commonjs',
    testFixtureStdio(
      'esm-ts-edge-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );
});

describe('[vercel dev] ESM serverless functions', () => {
  test(
    '[vercel dev] ESM .js type=module',
    testFixtureStdio(
      'esm-js-nodejs-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=module',
    testFixtureStdio(
      'esm-ts-nodejs-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const body = await res.json();
        expect(body).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .js type=commonjs',
    testFixtureStdio(
      'esm-js-nodejs-no-module',
      async (testPath: any) => {
        // bad gateway
        // require() of ESM Module
        await testPath(502, '/api/data');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=commonjs',
    testFixtureStdio(
      'esm-ts-nodejs-no-module',
      async (testPath: any) => {
        // bad gateway
        // require() of ESM Module
        await testPath(502, '/api/data');
      },
      { skipDeploy: true }
    )
  );
});
