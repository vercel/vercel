import test from 'ava';
import { devRouter } from '../src/util/dev/router';

test('[dev-router] 301 redirection', async t => {
  const routesConfig = [
    {
      src: '/redirect',
      status: 301,
      headers: { Location: 'https://vercel.com' },
    },
  ];
  const result = await devRouter('/redirect', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/redirect',
    continue: false,
    status: 301,
    headers: { location: 'https://vercel.com' },
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] captured groups', async t => {
  const routesConfig = [{ src: '/api/(.*)', dest: '/endpoints/$1.js' }];
  const result = await devRouter('/api/user', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/endpoints/user.js',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] named groups', async t => {
  const routesConfig = [{ src: '/user/(?<id>.+)', dest: '/user.js?id=$id' }];
  const result = await devRouter('/user/123', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/user.js',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: { id: '123' },
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] optional named groups', async t => {
  const routesConfig = [
    {
      src: '/api/hello(/(?<name>[^/]+))?',
      dest: '/api/functions/hello/index.js?name=$name',
    },
  ];
  const result = await devRouter('/api/hello', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/api/functions/hello/index.js',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: { name: '' },
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] proxy_pass', async t => {
  const routesConfig = [{ src: '/proxy', dest: 'https://vercel.com' }];

  const result = await devRouter('/proxy', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: 'https://vercel.com',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false,
    isDestUrl: true,
    phase: undefined,
  });
});

test('[dev-router] methods', async t => {
  const routesConfig = [
    { src: '/.*', methods: ['POST'], dest: '/post' },
    { src: '/.*', methods: ['GET'], dest: '/get' },
  ];

  let result = await devRouter('/', 'GET', routesConfig);
  t.deepEqual(result, {
    found: true,
    dest: '/get',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[1],
    matched_route_idx: 1,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });

  result = await devRouter('/', 'POST', routesConfig);
  t.deepEqual(result, {
    found: true,
    dest: '/post',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] match without prefix slash', async t => {
  const routesConfig = [{ src: 'api/(.*)', dest: 'endpoints/$1.js' }];
  const result = await devRouter('/api/user', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/endpoints/user.js',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
  });
});

test('[dev-router] match with needed prefixed slash', async t => {
  const routesConfig = [
    {
      src: '^\\/([^\\/]+?)\\/comments(?:\\/)?$',
      dest: '/some/dest',
    },
  ];
  const result = await devRouter('/post-1/comments', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/some/dest',
    continue: false,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: {
      src: '^\\/([^\\/]+?)\\/comments(?:\\/)?$',
      dest: '/some/dest',
    },
    matched_route_idx: 0,
  });
});

test('[dev-router] `continue: true` with fallthrough', async t => {
  const routesConfig = [
    {
      src: '/_next/static/(?:[^/]+/pages|chunks|runtime)/.+',
      continue: true,
      headers: {
        'cache-control': 'immutable,max-age=31536000',
      },
    },
  ];
  const result = await devRouter(
    '/_next/static/chunks/0.js',
    'GET',
    routesConfig
  );

  t.deepEqual(result, {
    found: false,
    dest: '/_next/static/chunks/0.js',
    continue: true,
    isDestUrl: false,
    phase: undefined,
    status: undefined,
    uri_args: {},
    headers: {
      'cache-control': 'immutable,max-age=31536000',
    },
  });
});

test('[dev-router] `continue: true` with match', async t => {
  const routesConfig = [
    {
      src: '/_next/static/(?:[^/]+/pages|chunks|runtime)/.+',
      continue: true,
      headers: {
        'cache-control': 'immutable,max-age=31536000',
      },
    },
    {
      src: '/(.*)',
      dest: '/hi',
    },
  ];
  const result = await devRouter(
    '/_next/static/chunks/0.js',
    'GET',
    routesConfig
  );

  t.deepEqual(result, {
    found: true,
    dest: '/hi',
    continue: false,
    status: undefined,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
    uri_args: {},
    headers: {
      'cache-control': 'immutable,max-age=31536000',
    },
    matched_route: {
      src: '/(.*)',
      dest: '/hi',
    },
    matched_route_idx: 1,
  });
});

test('[dev-router] match with catch-all with prefix slash', async t => {
  const routesConfig = [{ src: '/(.*)', dest: '/www/$1' }];
  const result = await devRouter('/', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/www/',
    continue: false,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: { src: '/(.*)', dest: '/www/$1' },
    matched_route_idx: 0,
  });
});

test('[dev-router] match with catch-all with no prefix slash', async t => {
  const routesConfig = [{ src: '(.*)', dest: '/www$1' }];
  const result = await devRouter('/', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/www/',
    continue: false,
    userDest: true,
    isDestUrl: false,
    phase: undefined,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: { src: '(.*)', dest: '/www$1' },
    matched_route_idx: 0,
  });
});

test('[dev-router] `continue: true` with `dest`', async t => {
  const routesConfig = [
    { src: '/(.*)', dest: '/www/$1', continue: true },
    {
      src: '^/www/(a\\/([^\\/]+?)(?:\\/)?)$',
      dest: 'http://localhost:5000/$1',
    },
  ];
  const result = await devRouter('/a/foo', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: 'http://localhost:5000/a/foo',
    continue: false,
    status: undefined,
    headers: {},
    uri_args: {},
    matched_route: routesConfig[1],
    matched_route_idx: 1,
    userDest: false,
    isDestUrl: true,
    phase: undefined,
  });
});
