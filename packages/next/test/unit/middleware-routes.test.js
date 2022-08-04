const { getMiddlewareBundle } = require('../../dist/utils');
const { genDir } = require('../utils');

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
                  type: 'header',
                  key: 'x-rewrite-me',
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
            type: 'header',
            key: 'x-rewrite-me',
          },
        ],
        middlewarePath: 'middleware',
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
