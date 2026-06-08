import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoutes,
  Router,
  deploymentEnv,
  matchers,
  type Route,
} from './router';
import type { Redirect, Rewrite } from './types';

const { header, cookie, query, host } = matchers;
import { cacheHeader } from 'pretty-cache-header';

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = createRoutes();
  });

  describe('rewrite', () => {
    it('should add a rewrite rule', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1');
      expect(rewrite).toEqual({
        source: '/api/(.*)',
        destination: '/legacy-api/$1',
      });
    });

    it('should return rewrite without transforms', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1');
      expect(rewrite).toHaveProperty('source');
      expect(rewrite).toHaveProperty('destination');
      expect(rewrite).not.toHaveProperty('transforms');
    });

    it('should add a rewrite rule with conditions', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1', {
        has: [{ type: 'header', key: 'X-Custom' }],
        missing: [{ type: 'cookie', key: 'auth' }],
      });
      expect(rewrite).toEqual({
        source: '/api/(.*)',
        destination: '/legacy-api/$1',
        has: [{ type: 'header', key: 'X-Custom' }],
        missing: [{ type: 'cookie', key: 'auth' }],
      });
    });

    it('should add a rewrite rule with respectOriginCacheControl: false', () => {
      const rewrite = router.rewrite(
        '/external/(.*)',
        'https://external-api.example.com/$1',
        {
          respectOriginCacheControl: false,
        }
      );
      expect(rewrite).toEqual({
        source: '/external/(.*)',
        destination: 'https://external-api.example.com/$1',
        respectOriginCacheControl: false,
      });
    });

    it('should add a rewrite rule with respectOriginCacheControl: true', () => {
      const rewrite = router.rewrite(
        '/external/(.*)',
        'https://external-api.example.com/$1',
        {
          respectOriginCacheControl: true,
        }
      );
      expect(rewrite).toEqual({
        source: '/external/(.*)',
        destination: 'https://external-api.example.com/$1',
        respectOriginCacheControl: true,
      });
    });

    it('should not include respectOriginCacheControl when not specified', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1');
      expect(rewrite).not.toHaveProperty('respectOriginCacheControl');
    });

    it('should return Rewrite type for simple rewrites', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1');
      expect(rewrite).toHaveProperty('source');
      expect(rewrite).toHaveProperty('destination');
    });

    it('should return Rewrite type when destination has env vars', () => {
      const rewrite = router.rewrite(
        '/api/:path*',
        `https://${deploymentEnv('API_HOST')}/$path*`
      );
      expect(rewrite).toEqual({
        source: '/api/:path*',
        destination: 'https://$API_HOST/$path*',
        env: ['API_HOST'],
      });
    });
  });

  describe('redirect', () => {
    it('should return a redirect rule', () => {
      const redirect = router.redirect('/old-path', '/new-path');
      expect(redirect).toEqual({
        source: '/old-path',
        destination: '/new-path',
      });
    });

    it('should return a permanent redirect', () => {
      const redirect = router.redirect('/old-path', '/new-path', {
        permanent: true,
      });
      expect(redirect).toEqual({
        source: '/old-path',
        destination: '/new-path',
        permanent: true,
      });
    });

    it('should return a redirect with custom status code', () => {
      const redirect = router.redirect('/old-path', '/new-path', {
        statusCode: 301,
      });
      expect(redirect).toEqual({
        source: '/old-path',
        destination: '/new-path',
        statusCode: 301,
      });
    });

    it('should return Redirect type when destination has env vars', () => {
      const redirect = router.redirect(
        '/old/:path*',
        `https://${deploymentEnv('NEW_HOST')}/$path*`
      );
      expect(redirect).toEqual({
        source: '/old/:path*',
        destination: 'https://$NEW_HOST/$path*',
        env: ['NEW_HOST'],
      });
    });
  });

  describe('header', () => {
    it('should return a header rule', () => {
      const headerRule = router.header('/api/(.*)', [
        { key: 'X-Custom', value: 'test' },
      ]);
      expect(headerRule).toEqual({
        source: '/api/(.*)',
        headers: [{ key: 'X-Custom', value: 'test' }],
      });
    });

    it('should return multiple headers', () => {
      const headerRule = router.header('/api/(.*)', [
        { key: 'X-Custom1', value: 'test1' },
        { key: 'X-Custom2', value: 'test2' },
      ]);
      expect(headerRule.headers).toHaveLength(2);
    });
  });

  describe('cacheControl', () => {
    it('should return a cache control header', () => {
      const headerRule = router.cacheControl('/static/(.*)', {
        public: true,
        maxAge: '1 week',
        staleWhileRevalidate: '1year',
      });
      expect(headerRule.headers[0].key).toBe('Cache-Control');
      expect(headerRule.headers[0].value).toBe(
        cacheHeader({
          public: true,
          maxAge: '1 week',
          staleWhileRevalidate: '1year',
        })
      );
    });
  });

  describe('input validation', () => {
    it('should throw error for invalid source pattern', () => {
      expect(() => router.rewrite('[invalid-regex', '/dest')).toThrow();
    });

    it('should throw error for invalid cron schedule', () => {
      expect(() => router.cron('/path', 'invalid-cron')).toThrow();
    });

    it('should throw error for negative lookahead without group', () => {
      expect(() =>
        router.rewrite('/feedback/(?!general)', '/api/feedback/general')
      ).toThrow(
        'Invalid path-to-regexp pattern: Negative lookaheads must be wrapped in a group'
      );
    });

    it('should throw error for wildcard pattern', () => {
      expect(() =>
        router.header('/*', [{ key: 'X-Custom', value: 'test' }])
      ).toThrow(
        "Invalid path-to-regexp pattern: Use '(.*)' instead of '*' for wildcards"
      );
    });

    it('should accept negative lookahead with group', () => {
      expect(() =>
        router.rewrite('/feedback/((?!general).*)', '/api/feedback/general')
      ).not.toThrow();
    });
  });

  describe('helper functions', () => {
    it('deploymentEnv() should return $ prefixed string', () => {
      expect(deploymentEnv('BEARER_TOKEN')).toBe('$BEARER_TOKEN');
      expect(deploymentEnv('API_KEY')).toBe('$API_KEY');
    });
  });

  describe('condition helpers', () => {
    describe('header()', () => {
      it('should create a presence-only condition', () => {
        expect(header('x-admin-token')).toEqual({
          type: 'header',
          key: 'x-admin-token',
        });
      });

      it('should create a regex value condition', () => {
        expect(header('accept', '(.*)text/markdown(.*)')).toEqual({
          type: 'header',
          key: 'accept',
          value: '(.*)text/markdown(.*)',
        });
      });

      it('should create an operator-based condition', () => {
        expect(header('x-user-role', { inc: ['admin', 'moderator'] })).toEqual({
          type: 'header',
          key: 'x-user-role',
          value: { inc: ['admin', 'moderator'] },
        });
      });

      it('should support all operator types', () => {
        expect(header('x-version', { eq: 2 })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { eq: 2 },
        });
        expect(header('x-version', { neq: 'beta' })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { neq: 'beta' },
        });
        expect(header('x-version', { gte: 2 })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { gte: 2 },
        });
        expect(header('x-version', { gt: 1 })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { gt: 1 },
        });
        expect(header('x-version', { lt: 5 })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { lt: 5 },
        });
        expect(header('x-version', { lte: 5 })).toEqual({
          type: 'header',
          key: 'x-version',
          value: { lte: 5 },
        });
        expect(header('x-auth', { pre: 'Bearer ' })).toEqual({
          type: 'header',
          key: 'x-auth',
          value: { pre: 'Bearer ' },
        });
        expect(header('x-auth', { suf: '-token' })).toEqual({
          type: 'header',
          key: 'x-auth',
          value: { suf: '-token' },
        });
        expect(header('x-role', { ninc: ['guest'] })).toEqual({
          type: 'header',
          key: 'x-role',
          value: { ninc: ['guest'] },
        });
      });
    });

    describe('cookie()', () => {
      it('should create a presence-only condition', () => {
        expect(cookie('session')).toEqual({
          type: 'cookie',
          key: 'session',
        });
      });

      it('should create a regex value condition', () => {
        expect(cookie('theme', 'dark|light')).toEqual({
          type: 'cookie',
          key: 'theme',
          value: 'dark|light',
        });
      });

      it('should create an operator-based condition', () => {
        expect(cookie('session', { pre: 'secure-' })).toEqual({
          type: 'cookie',
          key: 'session',
          value: { pre: 'secure-' },
        });
      });
    });

    describe('query()', () => {
      it('should create a presence-only condition', () => {
        expect(query('debug')).toEqual({
          type: 'query',
          key: 'debug',
        });
      });

      it('should create a regex value condition', () => {
        expect(query('format', 'markdown')).toEqual({
          type: 'query',
          key: 'format',
          value: 'markdown',
        });
      });

      it('should create an operator-based condition', () => {
        expect(query('page', { gte: 1 })).toEqual({
          type: 'query',
          key: 'page',
          value: { gte: 1 },
        });
      });
    });

    describe('host()', () => {
      it('should create a host value condition', () => {
        expect(host('example.com')).toEqual({
          type: 'host',
          value: 'example.com',
        });
      });

      it('should create a host operator condition', () => {
        expect(host({ suf: '.example.com' })).toEqual({
          type: 'host',
          value: { suf: '.example.com' },
        });
      });
    });

    describe('end-to-end with router', () => {
      it('should work in rewrite has/missing arrays', () => {
        const rewrite = router.rewrite(
          '/admin/(.*)',
          'https://admin.backend.com/$1',
          {
            has: [
              header('x-user-role', { inc: ['admin', 'moderator'] }),
              cookie('session', { pre: 'secure-' }),
            ],
            missing: [header('x-legacy-auth')],
          }
        );
        expect(rewrite).toEqual({
          source: '/admin/(.*)',
          destination: 'https://admin.backend.com/$1',
          has: [
            {
              type: 'header',
              key: 'x-user-role',
              value: { inc: ['admin', 'moderator'] },
            },
            { type: 'cookie', key: 'session', value: { pre: 'secure-' } },
          ],
          missing: [{ type: 'header', key: 'x-legacy-auth' }],
        });
      });

      it('should mix helpers with raw Condition objects', () => {
        const rewrite = router.rewrite('/api/(.*)', 'https://backend.com/$1', {
          has: [
            header('authorization', { pre: 'Bearer ' }),
            { type: 'header', key: 'x-api-version', value: { gte: 2 } },
          ],
        });
        expect(rewrite).toEqual({
          source: '/api/(.*)',
          destination: 'https://backend.com/$1',
          has: [
            { type: 'header', key: 'authorization', value: { pre: 'Bearer ' } },
            { type: 'header', key: 'x-api-version', value: { gte: 2 } },
          ],
        });
      });
    });
  });

  describe('rewrite with transforms', () => {
    it('should return Route with transforms and extract env vars', () => {
      const route = router.rewrite(
        '/users/:userId',
        'https://api.example.com/users/$1',
        ({ userId }) => ({
          requestHeaders: {
            'x-user-id': userId,
            authorization: `Bearer ${deploymentEnv('API_TOKEN')}`,
          },
        })
      );

      expect(route).toMatchObject({
        src: '^\\/users(?:\\/([^\\/]+?))$',
        dest: 'https://api.example.com/users/$1',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-user-id' },
            args: '$userId',
          },
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'authorization' },
            args: 'Bearer $API_TOKEN',
            env: ['API_TOKEN'],
          },
        ],
      });
    });

    it('should accept object syntax for transforms without path params', () => {
      const route = router.rewrite(
        '/api/(.*)',
        'https://backend.example.com/$1',
        {
          requestHeaders: {
            authorization: deploymentEnv('API_KEY'),
            'x-region': deploymentEnv('REGION'),
          },
        }
      );

      expect(route).toMatchObject({
        transforms: [{ env: ['API_KEY'] }, { env: ['REGION'] }],
      });
    });

    it('should include respectOriginCacheControl in route with transforms', () => {
      const route = router.rewrite(
        '/api/(.*)',
        'https://backend.example.com/$1',
        {
          requestHeaders: {
            authorization: deploymentEnv('API_KEY'),
          },
          respectOriginCacheControl: false,
        }
      );

      expect(route).toMatchObject({
        src: '^\\/api(?:\\/(.*))$',
        dest: 'https://backend.example.com/$1',
        respectOriginCacheControl: false,
      });
    });

    it('should not extract path params as env vars', () => {
      const route = router.rewrite(
        '/users/:userId',
        'https://api.example.com/users/$1',
        ({ userId }) => ({
          requestHeaders: {
            'x-user-id': userId,
            authorization: `Bearer ${deploymentEnv('TOKEN')}`,
          },
        })
      );

      // userId is a path param — should not have env
      // TOKEN is an env var — should appear in env
      expect(route).toMatchObject({
        transforms: [
          expect.not.objectContaining({ env: expect.anything() }),
          { env: ['TOKEN'] },
        ],
      });
    });
  });

  describe('rewrite callback without transforms', () => {
    it('should return Rewrite when callback returns only conditions', () => {
      const result = router.rewrite('/users/:userId', '/v2/users/$1', () => ({
        has: [{ type: 'header' as const, key: 'x-forwarded-for' }],
      }));
      expect(result).toHaveProperty('source');
      expect(result).not.toHaveProperty('transforms');
      expect(result).toEqual({
        source: '/users/:userId',
        destination: '/v2/users/$1',
        has: [{ type: 'header', key: 'x-forwarded-for' }],
      });
    });
  });

  describe('redirect with transforms', () => {
    it('should return Route with redirect flag and extract env vars', () => {
      const route = router.redirect('/old', '/new', () => ({
        permanent: true,
        requestHeaders: {
          'x-migration-token': deploymentEnv('MIGRATION_TOKEN'),
        },
      }));

      expect(route).toMatchObject({
        src: '^\\/old$',
        dest: '/new',
        status: 308,
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-migration-token' },
            args: '$MIGRATION_TOKEN',
            env: ['MIGRATION_TOKEN'],
          },
        ],
      });
    });

    it('should return simple Redirect without transforms', () => {
      const redirect = router.redirect('/old', '/new', { permanent: true });

      expect(redirect).toEqual({
        source: '/old',
        destination: '/new',
        permanent: true,
      });
      expect(redirect).not.toHaveProperty('transforms');
    });
  });

  describe('route', () => {
    it('should auto-extract env vars from transforms', () => {
      const route: Route = {
        src: '/users/:userId',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-user-id' },
            args: '$userId',
          },
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'authorization' },
            args: 'Bearer $BEARER_TOKEN',
          },
        ],
      };

      router.route(route);

      // Env should be auto-extracted
      // userId is a path param — should not have env
      expect(route).toMatchObject({
        transforms: [
          expect.not.objectContaining({ env: expect.anything() }),
          { env: ['BEARER_TOKEN'] },
        ],
      });
    });

    it('should extract env vars from array args', () => {
      const route: Route = {
        src: '/home',
        transforms: [
          {
            type: 'request.headers',
            op: 'append',
            target: { key: 'session-temp' },
            args: ['$REGION', '$DATACENTER'],
          },
        ],
      };

      router.route(route);

      expect(route).toMatchObject({
        transforms: [{ env: ['REGION', 'DATACENTER'] }],
      });
    });
  });

  describe('redirect return type narrowing', () => {
    it('should return Redirect with no options', () => {
      const result: Redirect = router.redirect('/old', '/new');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('destination');
      expect(result).not.toHaveProperty('transforms');
    });

    it('should return Redirect with permanent option', () => {
      const result: Redirect = router.redirect('/old', '/new', {
        permanent: true,
      });
      expect(result).toEqual({
        source: '/old',
        destination: '/new',
        permanent: true,
      });
    });

    it('should return Redirect with statusCode option', () => {
      const result: Redirect = router.redirect('/old-path', '/new-path', {
        statusCode: 301,
      });
      expect(result).toEqual({
        source: '/old-path',
        destination: '/new-path',
        statusCode: 301,
      });
    });

    it('should return Redirect with has/missing conditions', () => {
      const result: Redirect = router.redirect('/admin', '/login', {
        permanent: false,
        has: [{ type: 'header', key: 'x-test' }],
        missing: [{ type: 'cookie', key: 'auth' }],
      });
      expect(result.source).toBe('/admin');
      expect(result).not.toHaveProperty('transforms');
    });

    it('should return Route when requestHeaders is provided', () => {
      const result = router.redirect('/old', '/new', {
        permanent: true,
        requestHeaders: { 'x-key': 'val' },
      });
      expect(result).toHaveProperty('transforms');
    });

    it('should be assignable to Redirect[] without type assertions', () => {
      const redirects: Redirect[] = [
        router.redirect('/a', '/b'),
        router.redirect('/c', '/d', { permanent: true }),
        router.redirect('/e', '/f', { statusCode: 301 }),
        router.redirect('/g', '/h', {
          has: [{ type: 'cookie', key: 'session' }],
        }),
      ];
      expect(redirects).toHaveLength(4);
    });
  });

  describe('rewrite return type narrowing', () => {
    it('should return Rewrite with no options', () => {
      const result: Rewrite = router.rewrite('/api/(.*)', '/v2/$1');
      expect(result).toHaveProperty('source');
      expect(result).not.toHaveProperty('transforms');
    });

    it('should return Rewrite with has/missing conditions', () => {
      const result: Rewrite = router.rewrite('/api/(.*)', '/v2/$1', {
        has: [{ type: 'header', key: 'x-version' }],
      });
      expect(result.source).toBe('/api/(.*)');
      expect(result).not.toHaveProperty('transforms');
    });

    it('should return Rewrite with respectOriginCacheControl', () => {
      const result: Rewrite = router.rewrite(
        '/proxy/(.*)',
        'https://backend.example.com/$1',
        { respectOriginCacheControl: false }
      );
      expect(result).not.toHaveProperty('transforms');
    });

    it('should return Route when requestHeaders is provided', () => {
      const result = router.rewrite(
        '/api/(.*)',
        'https://backend.example.com/$1',
        { requestHeaders: { authorization: 'Bearer token' } }
      );
      expect(result).toHaveProperty('transforms');
    });

    it('should return Route when responseHeaders is provided', () => {
      const result = router.rewrite(
        '/api/(.*)',
        'https://backend.example.com/$1',
        { responseHeaders: { 'x-powered-by': 'vercel' } }
      );
      expect(result).toHaveProperty('transforms');
    });

    it('should return Route when requestQuery is provided', () => {
      const result = router.rewrite(
        '/api/(.*)',
        'https://backend.example.com/$1',
        { requestQuery: { version: '2' } }
      );
      expect(result).toHaveProperty('transforms');
    });

    it('should be assignable to Rewrite[] without type assertions', () => {
      const rewrites: Rewrite[] = [
        router.rewrite('/a/(.*)', '/b/$1'),
        router.rewrite('/c/(.*)', '/d/$1', {
          has: [{ type: 'header', key: 'x-test' }],
        }),
        router.rewrite('/e/(.*)', '/f/$1', {
          respectOriginCacheControl: false,
        }),
      ];
      expect(rewrites).toHaveLength(3);
    });
  });

  describe('route alias validation', () => {
    it('should throw if both src and source are defined', () => {
      expect(() => {
        router.route({ src: '/foo', source: '/bar' });
      }).toThrow('Route cannot define both `src` and `source`.');
    });

    it('should throw if both dest and destination are defined', () => {
      expect(() => {
        router.route({ src: '/foo', dest: '/bar', destination: '/baz' });
      }).toThrow('Route cannot define both `dest` and `destination`.');
    });

    it('should throw if both status and statusCode are defined', () => {
      expect(() => {
        router.route({ src: '/foo', status: 301, statusCode: 302 });
      }).toThrow('Route cannot define both `status` and `statusCode`.');
    });

    it('should accept source as an alias for src', () => {
      router.route({ source: '/foo', dest: '/bar' });
      const config = router.getConfig();
      const route = config.routes?.find(
        r => 'src' in r && r.src === '/foo'
      ) as Route;
      expect(route).toBeDefined();
      expect(route.src).toBe('/foo');
      expect(route.source).toBeUndefined();
    });

    it('should accept destination as an alias for dest', () => {
      router.route({ src: '/foo', destination: '/bar' });
      const config = router.getConfig();
      const route = config.routes?.find(
        r => 'src' in r && r.src === '/foo'
      ) as Route;
      expect(route).toBeDefined();
      expect(route.dest).toBe('/bar');
      expect(route.destination).toBeUndefined();
    });

    it('should accept statusCode as an alias for status', () => {
      router.route({ src: '/foo', statusCode: 301 });
      const config = router.getConfig();
      const route = config.routes?.find(
        r => 'src' in r && r.src === '/foo'
      ) as Route;
      expect(route).toBeDefined();
      expect(route.status).toBe(301);
      expect(route.statusCode).toBeUndefined();
    });
  });
});
