import { devRouter } from '../../../../src/util/dev/router';

describe('devRouter', () => {
  it('should handle 301 redirection', async () => {
    const routesConfig = [
      {
        src: '/redirect',
        status: 301,
        headers: { Location: 'https://vercel.com' },
      },
    ];
    const result = await devRouter('/redirect', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/redirect',
      continue: false,
      status: 301,
      headers: { location: 'https://vercel.com' },
      query: {},
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: false,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match captured groups', async () => {
    const routesConfig = [{ src: '/api/(.*)', dest: '/endpoints/$1.js' }];
    const result = await devRouter('/api/user', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/endpoints/user.js',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match named groups', async () => {
    const routesConfig = [{ src: '/user/(?<id>.+)', dest: '/user.js?id=$id' }];
    const result = await devRouter('/user/123', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/user.js',
      continue: false,
      status: undefined,
      headers: {},
      query: { id: ['123'] },
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match optional named groups', async () => {
    const routesConfig = [
      {
        src: '/api/hello(/(?<name>[^/]+))?',
        dest: '/api/functions/hello/index.js?name=$name',
      },
    ];
    const result = await devRouter('/api/hello', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/api/functions/hello/index.js',
      continue: false,
      status: undefined,
      headers: {},
      query: { name: [''] },
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match proxy_pass', async () => {
    const routesConfig = [{ src: '/proxy', dest: 'https://vercel.com' }];

    const result = await devRouter('/proxy', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: 'https://vercel.com',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: false,
      isDestUrl: true,
      phase: undefined,
    });
  });

  it('should match `methods`', async () => {
    const routesConfig = [
      { src: '/.*', methods: ['POST'], dest: '/post' },
      { src: '/.*', methods: ['GET'], dest: '/get' },
    ];

    let result = await devRouter('/', 'GET', routesConfig);
    expect(result).toMatchObject({
      found: true,
      dest: '/get',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[1],
      matched_route_idx: 1,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });

    result = await devRouter('/', 'POST', routesConfig);
    expect(result).toMatchObject({
      found: true,
      dest: '/post',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match without prefix slash', async () => {
    const routesConfig = [{ src: 'api/(.*)', dest: 'endpoints/$1.js' }];
    const result = await devRouter('/api/user', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/endpoints/user.js',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[0],
      matched_route_idx: 0,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
    });
  });

  it('should match with needed prefixed slash', async () => {
    const routesConfig = [
      {
        src: '^\\/([^\\/]+?)\\/comments(?:\\/)?$',
        dest: '/some/dest',
      },
    ];
    const result = await devRouter('/post-1/comments', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/some/dest',
      continue: false,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
      status: undefined,
      headers: {},
      query: {},
      matched_route: {
        src: '^\\/([^\\/]+?)\\/comments(?:\\/)?$',
        dest: '/some/dest',
      },
      matched_route_idx: 0,
    });
  });

  it('should match `continue: true` with fallthrough', async () => {
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

    expect(result).toMatchObject({
      found: false,
      dest: '/_next/static/chunks/0.js',
      continue: true,
      isDestUrl: false,
      phase: undefined,
      status: undefined,
      query: {},
      headers: {
        'cache-control': 'immutable,max-age=31536000',
      },
    });
  });

  it('should match `continue: true` with match', async () => {
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

    expect(result).toMatchObject({
      found: true,
      dest: '/hi',
      continue: false,
      status: undefined,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
      query: {},
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

  it('should match with catch-all with prefix slash', async () => {
    const routesConfig = [{ src: '/(.*)', dest: '/www/$1' }];
    const result = await devRouter('/', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/www/',
      continue: false,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
      status: undefined,
      headers: {},
      query: {},
      matched_route: { src: '/(.*)', dest: '/www/$1' },
      matched_route_idx: 0,
    });
  });

  it('should match with catch-all with no prefix slash', async () => {
    const routesConfig = [{ src: '(.*)', dest: '/www$1' }];
    const result = await devRouter('/', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: '/www/',
      continue: false,
      userDest: true,
      isDestUrl: false,
      phase: undefined,
      status: undefined,
      headers: {},
      query: {},
      matched_route: { src: '(.*)', dest: '/www$1' },
      matched_route_idx: 0,
    });
  });

  it('should match `continue: true` with `dest`', async () => {
    const routesConfig = [
      { src: '/(.*)', dest: '/www/$1', continue: true },
      {
        src: '^/www/(a\\/([^\\/]+?)(?:\\/)?)$',
        dest: 'http://localhost:5000/$1',
      },
    ];
    const result = await devRouter('/a/foo', 'GET', routesConfig);

    expect(result).toMatchObject({
      found: true,
      dest: 'http://localhost:5000/a/foo',
      continue: false,
      status: undefined,
      headers: {},
      query: {},
      matched_route: routesConfig[1],
      matched_route_idx: 1,
      userDest: false,
      isDestUrl: true,
      phase: undefined,
    });
  });
});
