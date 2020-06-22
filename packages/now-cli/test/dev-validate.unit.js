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
    public: true,
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
    'Invalid vercel.json - property `rewrites[0]` should NOT have additional property `src`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/rewrites'
  );
});

test('[dev-validate] should error with invalid routes array type', async t => {
  const config = {
    routes: { src: '/(.*)', dest: '/api/index.js' },
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `routes` should be of type array.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/routes'
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
    'Invalid vercel.json - property `redirects[0]` is missing property `source`.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/redirects'
  );
});

test('[dev-validate] should error with invalid redirects.permanent poperty', async t => {
  const config = {
    redirects: [{ source: '/', destination: '/go', permanent: 'yes' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `redirects[0].permanent` should be of type boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/redirects'
  );
});

test('[dev-validate] should error with invalid cleanUrls type', async t => {
  const config = {
    cleanUrls: 'true',
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `cleanUrls` should be of type boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/cleanurls'
  );
});

test('[dev-validate] should error with invalid trailingSlash type', async t => {
  const config = {
    trailingSlash: [true],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `trailingSlash` should be of type boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/trailingslash'
  );
});

test('[dev-validate] should error with invalid headers property', async t => {
  const config = {
    headers: [{ 'Content-Type': 'text/html' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers.source type', async t => {
  const config = {
    headers: [{ source: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `headers[0].source` should be of type string.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers additional property', async t => {
  const config = {
    headers: [{ source: '/', stuff: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `headers[0]` should NOT have additional property `stuff`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers wrong nested headers type', async t => {
  const config = {
    headers: [{ source: '/', headers: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `headers[0].headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers wrong nested headers additional property', async t => {
  const config = {
    headers: [
      { source: '/', headers: [{ key: 'Content-Type', val: 'text/html' }] },
    ],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - property `headers[0].headers[0]` should NOT have additional property `val`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});
