import test from 'ava';

import devRouter from '../src/commands/dev/lib/dev-router';

test('[dev-router] 301 redirection', async (t) => {
  const routesConfig = [
    { src: '/redirect', status: 301, headers: { 'Location': 'https://zeit.co' } }
  ];
  const result = await devRouter('/redirect', routesConfig);

  t.deepEqual(result, {
    dest: '/redirect',
    status: 301,
    headers: { 'Location': 'https://zeit.co' },
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false
  });
});

test('[dev-router] captured groups', async (t) => {
  const routesConfig = [
    { src: '/api/(.*)', dest: '/endpoints/$1.js' }
  ];
  const result = await devRouter('/api/user', routesConfig);

  t.deepEqual(result, {
    dest: '/endpoints/user.js',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});

test('[dev-router] named groups', async (t) => {
  const routesConfig = [
    { src: '/user/(?<id>.+)', dest: '/user.js?id=$id' }
  ];
  const result = await devRouter('/user/123', routesConfig);

  t.deepEqual(result, {
    dest: '/user.js',
    status: undefined,
    headers: undefined,
    uri_args: { id: '123' },
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: true
  });
});

test('[dev-router] unreached route', async (t) => {
  const routesConfig = [
    { src: '/.*', dest: '/index.js' },
    { src: '/hidden', dest: '/hidden.js' }
  ];

  const result = await devRouter('/hidden', routesConfig);

  // We need to match the last route. We read from
  // top to bottom and every route can overwrite each other.
  t.deepEqual(result, {
    dest: '/hidden.js',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[1],
    matched_route_idx: 1
  });
});

test('[dev-router] proxy_pass', async (t) => {
  const routesConfig = [
    { src: '/proxy', dest: 'https://zeit.co' }
  ];

  const result = await devRouter('/proxy', routesConfig);

  t.deepEqual(result, {
    dest: 'https://zeit.co',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0,
    userDest: false
  });
});
