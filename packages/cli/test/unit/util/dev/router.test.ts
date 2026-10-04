import { describe, expect, it } from 'vitest';
import type { Route } from '@vercel/routing-utils';
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

  it('accumulates transforms from a `continue` route and the terminal route', async () => {
    const routesConfig = [
      {
        src: '/(.*)',
        continue: true,
        transforms: [
          {
            type: 'request.headers' as const,
            op: 'set' as const,
            target: { key: 'x-a' },
            args: '1',
          },
        ],
      },
      {
        src: '/foo',
        dest: '/bar.js',
        transforms: [
          {
            type: 'request.headers' as const,
            op: 'set' as const,
            target: { key: 'x-b' },
            args: '2',
          },
        ],
      },
    ];
    const result = await devRouter('/foo', 'GET', routesConfig);

    expect(result.requestTransforms).toHaveLength(2);
    expect(result.requestTransforms?.[0]).toMatchObject({
      target: { key: 'x-a' },
    });
    expect(result.requestTransforms?.[1]).toMatchObject({
      target: { key: 'x-b' },
    });
  });

  it('uses only the latest transform route as the response context', async () => {
    const routesConfig = [
      {
        src: '/(.*)',
        continue: true,
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-early' },
            args: 'early',
          },
        ],
      },
      {
        src: '/foo',
        dest: '/bar.js',
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-late' },
            args: 'late',
          },
        ],
      },
    ];
    const result = await devRouter('/foo', 'GET', routesConfig);

    // request transforms accumulate, but the response context is replaced, not
    // accumulated: only the latest matched transform route wins.
    expect(result.requestTransforms).toHaveLength(2);
    expect(result.responseTransforms).toHaveLength(1);
    expect(result.responseTransforms?.[0]).toMatchObject({
      target: { key: 'x-late' },
    });
  });

  it('skips transforms on a service-marker route', async () => {
    const routesConfig = [
      {
        src: '/transform/(.*)',
        destination: { type: 'service' as const, service: 'backend' },
        transforms: [
          {
            type: 'request.path' as const,
            op: 'set' as const,
            args: '/api/$1',
          },
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-marker-resp' },
            args: '1',
          },
        ],
      },
    ];
    const result = await devRouter('/transform/echo', 'GET', routesConfig);

    // A service-marker route is a terminal handoff
    expect(result.requestTransforms).toHaveLength(0);
    expect(result.responseTransforms).toBeUndefined();
  });

  it('does not set a response context for a redirect route, keeping the prior one', async () => {
    const routesConfig = [
      {
        src: '/(.*)',
        continue: true,
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-prior' },
            args: 'prior',
          },
        ],
      },
      {
        src: '/old',
        status: 308,
        headers: { Location: '/new' },
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-should-not-apply' },
            args: '1',
          },
        ],
      },
    ];
    const result = await devRouter('/old', 'GET', routesConfig);

    expect(result.status).toBe(308);
    // the redirecting route's own transforms must not become the context; the
    // earlier `continue` route's context is preserved.
    expect(result.responseTransforms).toHaveLength(1);
    expect(result.responseTransforms?.[0]).toMatchObject({
      target: { key: 'x-prior' },
    });
  });

  it('keeps the response context for a terminal non-redirect status route', async () => {
    const routesConfig = [
      {
        src: '/gone',
        status: 410,
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-gone' },
            args: '1',
          },
        ],
      },
    ];
    const result = await devRouter('/gone', 'GET', routesConfig);

    expect(result.status).toBe(410);
    // The proxy's handle_status() only breaks for redirects; a non-redirect
    // status (410) proceeds past the transform step, so its own response
    // transforms still apply.
    expect(result.responseTransforms).toHaveLength(1);
    expect(result.responseTransforms?.[0]).toMatchObject({
      target: { key: 'x-gone' },
    });
  });

  it('stores a `check` + non-redirect status route’s own transforms', async () => {
    // A `check` rewrite that misses and exits via a non-redirect status still
    // proceeds past the transform step, so its own transforms become the latest
    // context (overriding an earlier one) — matching the proxy.
    const devServer = {
      isCaseSensitive: () => false,
      hasFilesystem: async () => false,
      envConfigs: { runEnv: {} },
    } as unknown as Parameters<typeof devRouter>[3];
    const routesConfig = [
      {
        src: '/(.*)',
        continue: true,
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-prior' },
            args: 'prior',
          },
        ],
      },
      {
        src: '/gone',
        check: true,
        status: 410,
        transforms: [
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-gone' },
            args: '1',
          },
        ],
      },
    ];
    const result = await devRouter(
      '/gone',
      'GET',
      routesConfig,
      devServer,
      {} as unknown as Parameters<typeof devRouter>[4]
    );

    expect(result.status).toBe(410);
    expect(result.responseTransforms).toHaveLength(1);
    expect(result.responseTransforms?.[0]).toMatchObject({
      target: { key: 'x-gone' },
    });
  });

  it('surfaces request and response transforms for an error-phase route', async () => {
    // The proxy runs the error phase through the same per-route loop as every
    // other phase, so an error route applies its request transforms and stores
    // its response context.
    const routesConfig = [
      {
        src: '/oops',
        dest: '/error.js',
        transforms: [
          {
            type: 'request.path' as const,
            op: 'set' as const,
            args: '/e',
          },
          {
            type: 'response.headers' as const,
            op: 'set' as const,
            target: { key: 'x-err' },
            args: '1',
          },
        ],
      },
    ];
    const result = await devRouter(
      '/oops',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      'error'
    );

    expect(result.phase).toBe('error');
    expect(result.requestTransforms?.some(t => t.type === 'request.path')).toBe(
      true
    );
    expect(
      result.responseTransforms?.some(t => t.type === 'response.headers')
    ).toBe(true);
  });

  it('should skip a route when its `has` header condition is not met', async () => {
    const routesConfig: Route[] = [
      {
        src: '/(.*)',
        dest: '/private/$1',
        has: [{ type: 'header', key: 'x-auth' }],
      },
      { src: '/(.*)', dest: '/public/$1' },
    ];
    const result = await devRouter(
      '/page',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {}
    );

    expect(result).toMatchObject({
      found: true,
      dest: '/public/page',
      matched_route: routesConfig[1],
      matched_route_idx: 1,
    });
  });

  it('should match a route when its `has` header condition is met', async () => {
    const routesConfig: Route[] = [
      {
        src: '/(.*)',
        dest: '/private/$1',
        has: [{ type: 'header', key: 'x-auth' }],
      },
      { src: '/(.*)', dest: '/public/$1' },
    ];
    const result = await devRouter(
      '/page',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { 'x-auth': 'token' }
    );

    expect(result).toMatchObject({
      found: true,
      dest: '/private/page',
      matched_route: routesConfig[0],
      matched_route_idx: 0,
    });
  });

  it('should substitute named groups captured from `has` values', async () => {
    const routesConfig: Route[] = [
      {
        src: '/proxy/(.*)',
        dest: 'https://example.com/$tenant/$1',
        has: [
          {
            type: 'header',
            key: 'x-tenant',
            value: '(?<tenant>[a-z]+)',
          },
        ],
      },
    ];
    const result = await devRouter(
      '/proxy/docs',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { 'x-tenant': 'acme' }
    );

    expect(result).toMatchObject({
      found: true,
      dest: 'https://example.com/acme/docs',
      isDestUrl: true,
    });
  });

  it('should substitute bare `has` keys from the query string', async () => {
    const routesConfig: Route[] = [
      {
        src: '/blog',
        dest: '/post-$id.js',
        has: [{ type: 'query', key: 'id' }],
      },
    ];
    const result = await devRouter(
      '/blog?id=42',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {}
    );

    expect(result).toMatchObject({
      found: true,
      dest: '/post-42.js',
      query: { id: ['42'] },
    });
  });

  it('should match `has` cookie and host conditions', async () => {
    const routesConfig: Route[] = [
      {
        src: '/(.*)',
        dest: '/eu/$1',
        has: [
          { type: 'cookie', key: 'region', value: '^eu' },
          { type: 'host', value: '^(?<sub>[a-z]+)\\.example\\.com$' },
        ],
      },
    ];
    const result = await devRouter(
      '/page',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { cookie: 'region=eu-west', host: 'shop.example.com:3000' }
    );

    expect(result).toMatchObject({ found: true, dest: '/eu/page' });
  });

  it('should skip a route when its `missing` condition is present', async () => {
    const routesConfig: Route[] = [
      {
        src: '/(.*)',
        dest: '/cached/$1',
        missing: [{ type: 'header', key: 'x-no-cache' }],
      },
      { src: '/(.*)', dest: '/fresh/$1' },
    ];

    let result = await devRouter(
      '/page',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { 'x-no-cache': '1' }
    );
    expect(result).toMatchObject({
      found: true,
      dest: '/fresh/page',
      matched_route_idx: 1,
    });

    result = await devRouter(
      '/page',
      'GET',
      routesConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {}
    );
    expect(result).toMatchObject({
      found: true,
      dest: '/cached/page',
      matched_route_idx: 0,
    });
  });

  it('should ignore `has` conditions when no request headers are given', async () => {
    const routesConfig: Route[] = [
      {
        src: '/(.*)',
        dest: '/private/$1',
        has: [{ type: 'header', key: 'x-auth' }],
      },
    ];
    const result = await devRouter('/page', 'GET', routesConfig);

    expect(result).toMatchObject({ found: true, dest: '/private/page' });
  });
});
