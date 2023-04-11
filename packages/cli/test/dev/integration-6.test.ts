const {
  fetch,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

test(
  '[vercel dev] ESM .js edge type=module',
  testFixtureStdio(
    'esm-js-edge-module',
    async (_testPath: any, port: any) => {
      const res = await fetch(`http://localhost:${port}/api/data`);
      validateResponseHeaders(res);
      const body = await res.json();
      expect(body).toHaveProperty('isLeapYear');
    },
    { skipDeploy: true }
  )
);
