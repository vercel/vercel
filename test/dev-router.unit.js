import test from 'ava';

import devRouter from '../src/commands/dev/lib/dev-router';

test('[dev-router] 301 redirection', t => {
  const routesConfig = [
    { src: '/redirect', status: 301, headers: { 'Location': 'https://zeit.co' } }
  ];
  const result = devRouter('/redirect', routesConfig);

  t.deepEqual(result, {
    dest: '/redirect',
    status: 301,
    headers: { 'Location': 'https://zeit.co' },
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0
  });
});

test('[dev-router] captured groups', t => {
  const routesConfig = [
    { src: '/api/(.*)', dest: '/endpoints/$1.js' }
  ];
  const result = devRouter('/api/user', routesConfig);

  t.deepEqual(result, {
    dest: '/endpoints/user.js',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0
  });
});

test('[dev-router] named groups', t => {
  const routesConfig = [
    { src: '/user/(?<id>.+)', dest: '/user.js?id=$<id>' }
  ];
  const result = devRouter('/user/123', routesConfig);

  t.deepEqual(result, {
    dest: '/user.js',
    status: undefined,
    headers: undefined,
    uri_args: { id: '123' },
    matched_route: routesConfig[0],
    matched_route_idx: 0
  });
});

test('[dev-router] unreached route', t => {
  const routesConfig = [
    { src: '/.*', dest: '/index.js' },
    { src: '/hidden', dest: '/hidden.js' }
  ];

  const result = devRouter('/hidden', routesConfig);

  t.deepEqual(result, {
    dest: '/index.js',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0
  });
});


test('[dev-router] proxy_pass', t => {
  const routesConfig = [
    { src: '/proxy', dest: 'https://zeit.co' }
  ];

  const result = devRouter('/proxy', routesConfig);

  t.deepEqual(result, {
    dest: 'https://zeit.co',
    status: undefined,
    headers: undefined,
    uri_args: {},
    matched_route: routesConfig[0],
    matched_route_idx: 0
  });
});
