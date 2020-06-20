import test from 'ava';
import { validateConfig } from '../src/util/dev/validate';

test('[dev-validate] should not error with empty config', async t => {
  const config = {};
  const error = validateConfig(config);
  t.deepEqual(error, null);
});

test('[dev-validate] should not error with complete config', async t => {
  const config = {
    version: 2,
    regions: ['sfo1', 'iad1'],
    builds: [{ src: 'package.json', use: '@vercel/next' }],
    cleanUrls: true,
    headers: [{ source: '/', headers: [{ key: 'x-id', value: '123' }] }],
    rewrites: [{ source: '/help', destination: '/support' }],
    redirects: [{ source: '/kb', destination: 'https://example.com' }],
    trailingSlash: false,
    functions: { 'api/user.go': { memory: 128, maxDuration: 5 } },
  };
  const error = validateConfig(config);
  t.deepEqual(error, null);
});

test('[dev-validate] should not error with builds and routes', async t => {
  const config = {
    builds: [{ src: 'api/index.js', use: '@vercel/node' }],
    routes: [{ src: '/(.*)', dest: '/api/index.js' }],
  };
  const error = validateConfig(config);
  t.deepEqual(error, null);
});

test('[dev-validate] should error with invalid rewrites due to additional property', async t => {
  const config = {
    rewrites: [{ src: '/(.*)', dest: '/api/index.js' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Configuration property `rewrites` should NOT have additional property `src`.'
  );
});

test('[dev-validate] should error with invalid routes array type', async t => {
  const config = {
    routes: { src: '/(.*)', dest: '/api/index.js' },
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Configuration property `routes` should be of type array but found type object.'
  );
});

test('[dev-validate] should error with invalid redirects array object', async t => {
  const config = {
    redirects: [
      {
        /* intentionally empty */
      },
    ],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Configuration property `redirects` is missing property `source`.'
  );
});

test('[dev-validate] should error with invalid redirects.permanent poperty', async t => {
  const config = {
    redirects: [{ source: '/', destination: '/go', permanent: 'yes' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Configuration property `redirects` should have property `permanent` of type boolean.'
  );
});
