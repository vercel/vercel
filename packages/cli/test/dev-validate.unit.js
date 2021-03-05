import test from 'ava';
import { validateConfig } from '../src/util/dev/validate';

test('[dev-validate] should not error with empty config', async (t) => {
  const config = {};
  const error = validateConfig(config);
  t.deepEqual(error, null);
});

test('[dev-validate] should not error with complete config', async (t) => {
  const config = {
    version: 2,
    public: true,
    regions: ['sfo1', 'iad1'],
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

test('[dev-validate] should not error with builds and routes', async (t) => {
  const config = {
    builds: [{ src: 'api/index.js', use: '@vercel/node' }],
    routes: [{ src: '/(.*)', dest: '/api/index.js' }],
  };
  const error = validateConfig(config);
  t.deepEqual(error, null);
});

test('[dev-validate] should error with invalid rewrites due to additional property and offer suggestion', async (t) => {
  const config = {
    rewrites: [{ src: '/(.*)', dest: '/api/index.js' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `rewrites[0]` should NOT have additional property `src`. Did you mean `source`?'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/rewrites'
  );
});

test('[dev-validate] should error with invalid routes due to additional property and offer suggestion', async (t) => {
  const config = {
    routes: [{ source: '/(.*)', destination: '/api/index.js' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `routes[0]` should NOT have additional property `source`. Did you mean `src`?'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/routes'
  );
});

test('[dev-validate] should error with invalid routes array type', async (t) => {
  const config = {
    routes: { src: '/(.*)', dest: '/api/index.js' },
  };
  const error = validateConfig(config);
  t.deepEqual(error.message, 'Invalid vercel.json - `routes` should be array.');
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/routes'
  );
});

test('[dev-validate] should error with invalid redirects array object', async (t) => {
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
    'Invalid vercel.json - `redirects[0]` missing required property `source`.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/redirects'
  );
});

test('[dev-validate] should error with invalid redirects.permanent poperty', async (t) => {
  const config = {
    redirects: [{ source: '/', destination: '/go', permanent: 'yes' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `redirects[0].permanent` should be boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/redirects'
  );
});

test('[dev-validate] should error with invalid cleanUrls type', async (t) => {
  const config = {
    cleanUrls: 'true',
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `cleanUrls` should be boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/cleanurls'
  );
});

test('[dev-validate] should error with invalid trailingSlash type', async (t) => {
  const config = {
    trailingSlash: [true],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `trailingSlash` should be boolean.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/trailingslash'
  );
});

test('[dev-validate] should error with invalid headers property', async (t) => {
  const config = {
    headers: [{ 'Content-Type': 'text/html' }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers.source type', async (t) => {
  const config = {
    headers: [{ source: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[0].source` should be string.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers additional property', async (t) => {
  const config = {
    headers: [{ source: '/', stuff: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[0]` should NOT have additional property `stuff`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers wrong nested headers type', async (t) => {
  const config = {
    headers: [{ source: '/', headers: [{ 'Content-Type': 'text/html' }] }],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with invalid headers wrong nested headers additional property', async (t) => {
  const config = {
    headers: [
      { source: '/', headers: [{ key: 'Content-Type', val: 'text/html' }] },
    ],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `val`. Please remove it.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with too many redirects', async (t) => {
  const config = {
    redirects: Array.from({ length: 5000 }).map((_, i) => ({
      source: `/${i}`,
      destination: `/v/${i}`,
    })),
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `redirects` should NOT have more than 1024 items.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/redirects'
  );
});

test('[dev-validate] should error with too many nested headers', async (t) => {
  const config = {
    headers: [
      {
        source: '/',
        headers: [{ key: `x-id`, value: `123` }],
      },
      {
        source: '/too-many',
        headers: Array.from({ length: 5000 }).map((_, i) => ({
          key: `${i}`,
          value: `${i}`,
        })),
      },
    ],
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'Invalid vercel.json - `headers[1].headers` should NOT have more than 1024 items.'
  );
  t.deepEqual(
    error.link,
    'https://vercel.com/docs/configuration#project/headers'
  );
});

test('[dev-validate] should error with "functions" and "builds"', async (t) => {
  const config = {
    builds: [
      {
        src: 'index.html',
        use: '@vercel/static',
      },
    ],
    functions: {
      'api/test.js': {
        memory: 1024,
      },
    },
  };
  const error = validateConfig(config);
  t.deepEqual(
    error.message,
    'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.'
  );
  t.deepEqual(error.link, 'https://vercel.link/functions-and-builds');
});
