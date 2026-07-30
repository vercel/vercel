import { describe, it, expect } from 'vitest';
import {
  fastapiShadowingRoutes,
  fastapiFallbackRoutes,
  type FastAPICollectStaticResult,
} from '../src/fastapi';

// A discovery result carrying only the fields the route helpers read.
function discovery(
  over: Partial<FastAPICollectStaticResult>
): FastAPICollectStaticResult {
  return {
    collectedMounts: [],
    cdnOutputDir: '/out',
    shadowRoutes: [],
    fallbacks: [],
    ...over,
  };
}

describe('fastapiShadowingRoutes', () => {
  it('returns [] when nothing is shadowed', () => {
    expect(
      fastapiShadowingRoutes(discovery({ shadowRoutes: [] }), 'api/index')
    ).toEqual([]);
  });

  it('ORs the (pre-escaped) shadow bodies into one group routed to the Lambda', () => {
    expect(
      fastapiShadowingRoutes(
        discovery({
          shadowRoutes: ['static/example\\.txt', 'items/(?:[0-9]+)'],
        }),
        'api/index'
      )
    ).toEqual([
      {
        src: '^/(static/example\\.txt|items/(?:[0-9]+))$',
        dest: '/api/index',
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      },
    ]);
  });
});

describe('fastapiFallbackRoutes', () => {
  it('returns [] when there are no fallbacks', () => {
    expect(fastapiFallbackRoutes(discovery({}))).toEqual([]);
  });

  it('gates a 200 (index.html) fallback on an Accept navigation header', () => {
    expect(
      fastapiFallbackRoutes(
        discovery({
          collectedMounts: ['/spa'],
          fallbacks: [{ urlPath: '/spa', file: 'index.html', status: 200 }],
        })
      )
    ).toEqual([
      {
        src: '^/spa/.*$',
        dest: '/spa/index.html',
        status: 200,
        check: true,
        methods: ['GET', 'HEAD'],
        has: [
          {
            type: 'header',
            key: 'accept',
            value: '.*(?:text/html|application/xhtml\\+xml).*',
          },
        ],
      },
    ]);
  });

  it('serves a 404 (404.html) fallback for every miss (no Accept gate)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/both'],
        fallbacks: [{ urlPath: '/both', file: '404.html', status: 404 }],
      })
    );
    expect(route).toEqual({
      src: '^/both/.*$',
      dest: '/both/404.html',
      status: 404,
      check: true,
      methods: ['GET', 'HEAD'],
    });
    expect(route).not.toHaveProperty('has');
  });

  it('excludes nested sibling mounts via a negative lookahead (root mount)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/', '/assets', '/api/docs'],
        fallbacks: [{ urlPath: '/', file: 'index.html', status: 200 }],
      })
    );
    expect(route.src).toBe('^/(?!(?:assets|api/docs)(?:/|$)).*$');
    expect(route.dest).toBe('/index.html');
  });

  it('escapes regex metacharacters in the mount prefix (src only, not dest)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/v1.0'],
        fallbacks: [{ urlPath: '/v1.0', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/v1\\.0/.*$');
    expect(route.dest).toBe('/v1.0/404.html');
  });

  it('escapes regex metacharacters in nested sibling sub-paths (guard)', () => {
    const [route] = fastapiFallbackRoutes(
      discovery({
        collectedMounts: ['/app', '/app/a.b'],
        fallbacks: [{ urlPath: '/app', file: '404.html', status: 404 }],
      })
    );
    expect(route.src).toBe('^/app/(?!(?:a\\.b)(?:/|$)).*$');
  });
});
