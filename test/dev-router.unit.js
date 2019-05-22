import test from 'ava';

import devRouter from '../src/commands/dev/lib/dev-router';

test('[dev-router] 301 redirection', async t => {
  const routesConfig = [
    { src: '/redirect', status: 301, headers: { Location: 'https://zeit.co' } }
  ];
  const result = await devRouter('/redirect', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/redirect',
    status: 301,
    headers: { Location: 'https://zeit.co' },
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false
  });
});

test('[dev-router] captured groups', async t => {
  const routesConfig = [{ src: '/api/(.*)', dest: '/endpoints/$1.js' }];
  const result = await devRouter('/api/user', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/endpoints/user.js',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});

test('[dev-router] named groups', async t => {
  const routesConfig = [{ src: '/user/(?<id>.+)', dest: '/user.js?id=$id' }];
  const result = await devRouter('/user/123', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/user.js',
    status: undefined,
    headers: undefined,
    uri_args: { id: '123' },
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});

test('[dev-router] optional named groups', async t => {
  const routesConfig = [{
    src: '/api/hello(/(?<name>[^/]+))?',
    dest: '/api/functions/hello/index.js?name=$name'
  }];
  const result = await devRouter('/api/hello', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: '/api/functions/hello/index.js',
    status: undefined,
    headers: undefined,
    uri_args: { name: '' },
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});

test('[dev-router] proxy_pass', async t => {
  const routesConfig = [{ src: '/proxy', dest: 'https://zeit.co' }];

  const result = await devRouter('/proxy', 'GET', routesConfig);

  t.deepEqual(result, {
    found: true,
    dest: 'https://zeit.co',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false
  });
});

test('[dev-router] methods', async t => {
  const routesConfig = [
    { src: '/.*', methods: ['POST'], dest: '/post' },
    { src: '/.*', methods: ['GET'], dest: '/get' }
  ];

  let result = await devRouter('/', 'GET', routesConfig);
  t.deepEqual(result, {
    found: true,
    dest: '/get',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[1],
    matched_route_idx: 1,
    userDest: true
  });

  result = await devRouter('/', 'POST', routesConfig);
  t.deepEqual(result, {
    found: true,
    dest: '/post',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});
