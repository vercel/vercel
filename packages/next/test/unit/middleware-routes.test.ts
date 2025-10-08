import { getMiddlewareBundle } from '../../src/utils';
import { genDir } from '../utils';

describe('middleware routes', () => {
  it('should generate a route for v1 middleware manifest', async () => {
    const routes = await getMiddlewareRoutes({
      version: 1,
      sortedMiddleware: ['/'],
      middleware: {
        '/': {
          env: [],
          files: [],
          name: 'middleware',
          page: '/',
          regexp: '^/.*$',
        },
      },
    });
    expect(routes).toEqual([
      {
        continue: true,
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^/.*$',
      },
    ]);
  });

  it('should generate a route for v2 middleware manifest', async () => {
    const routes = await getMiddlewareRoutes({
      version: 2,
      sortedMiddleware: ['/'],
      middleware: {
        '/': {
          env: [],
          files: [],
          name: 'middleware',
          page: '/',
          matchers: [{ regexp: '^/.*$' }],
        },
      },
    });
    expect(routes).toEqual([
      {
        continue: true,
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^/.*$',
      },
    ]);
  });

  it('should generate multiple routes for v2 middleware manifest', async () => {
    const routes = await getMiddlewareRoutes({
      version: 2,
      sortedMiddleware: ['/'],
      middleware: {
        '/': {
          env: [],
          files: [],
          name: 'middleware',
          page: '/',
          matchers: [
            { regexp: '^\\/foo[\\/#\\?]?$' },
            {
              regexp: '^\\/bar[\\/#\\?]?$',
              has: [
                {
                  type: 'query',
                  key: 'mykey',
                  value: 'myvalue',
                },
              ],
            },
          ],
        },
      },
    });
    expect(routes).toEqual([
      {
        continue: true,
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^\\/foo[\\/#\\?]?$',
      },
      {
        continue: true,
        has: [
          {
            type: 'query',
            key: 'mykey',
            value: 'myvalue',
          },
        ],
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^\\/bar[\\/#\\?]?$',
      },
    ]);
  });

  it('should make header key lowercase', async () => {
    const routes = await getMiddlewareRoutes({
      version: 2,
      sortedMiddleware: ['/'],
      middleware: {
        '/': {
          env: [],
          files: [],
          name: 'middleware',
          page: '/',
          matchers: [
            {
              regexp: '^\\/asdf[\\/#\\?]?$',
              has: [
                {
                  type: 'header',
                  key: 'X-Rewrite-Me',
                },
              ],
            },
          ],
        },
      },
    });
    expect(routes).toEqual([
      {
        continue: true,
        has: [
          {
            type: 'header',
            key: 'x-rewrite-me',
          },
        ],
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^\\/asdf[\\/#\\?]?$',
      },
    ]);
  });

  it('should generate routes with _next/data', async () => {
    const routes = await getMiddlewareRoutes({
      version: 1,
      sortedMiddleware: ['/'],
      middleware: {
        '/': {
          env: [],
          files: [],
          name: 'middleware',
          page: '/',
          regexp:
            '^\\/docs(?:\\/(_next\\/data\\/[^/]{1,}))?\\/hello(.json)?[\\/#\\?]?$',
        },
      },
    });
    expect(routes).toEqual([
      {
        continue: true,
        middlewarePath: 'middleware',
        middlewareRawSrc: [],
        missing: [
          {
            key: 'x-prerender-revalidate',
            type: 'header',
            value: '',
          },
        ],
        override: true,
        src: '^\\/docs(?:\\/(_next\\/data\\/[^/]{1,}))?\\/hello(.json)?[\\/#\\?]?$',
      },
    ]);
  });
});

async function getMiddlewareRoutes(manifest) {
  const dir = await genDir({
    '.next/server/middleware-manifest.json': JSON.stringify(manifest),
  });
  const middleware = await getMiddlewareBundle({
    entryPath: dir,
    outputDirectory: '.next',
    routesManifest: {
      version: 4,
      dynamicRoutes: [],
      pages404: false,
      redirects: [],
      rewrites: [],
      staticRoutes: [],
    },
    isCorrectMiddlewareOrder: true,
    prerenderBypassToken: '',
  });
  expect(middleware.dynamicRouteMap.size).toBe(0);
  return middleware.staticRoutes;
}
