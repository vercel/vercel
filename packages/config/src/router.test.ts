import { describe, it, expect, beforeEach } from 'vitest';
import { createRoutes, Router, deploymentEnv } from './router';
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

    it('should return Rewrite type for simple rewrites', () => {
      const rewrite = router.rewrite('/api/(.*)', '/legacy-api/$1');
      expect(rewrite).toHaveProperty('source');
      expect(rewrite).toHaveProperty('destination');
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
        src: '/users/:userId',
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

      expect(route.transforms[0].env).toEqual(['API_KEY']);
      expect(route.transforms[1].env).toEqual(['REGION']);
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

      // userId is a path param, not an env var
      expect(route.transforms[0].env).toBeUndefined();
      // TOKEN is an env var
      expect(route.transforms[1].env).toEqual(['TOKEN']);
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
        src: '/old',
        dest: '/new',
        redirect: true,
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
      const route = {
        src: '/users/:userId',
        transforms: [
          {
            type: 'request.headers' as const,
            op: 'set' as const,
            target: { key: 'x-user-id' },
            args: '$userId',
          },
          {
            type: 'request.headers' as const,
            op: 'set' as const,
            target: { key: 'authorization' },
            args: 'Bearer $BEARER_TOKEN',
          },
        ],
      };

      router.route(route);

      // Env should be auto-extracted
      expect(route.transforms[0].env).toBeUndefined(); // userId is path param
      expect(route.transforms[1].env).toEqual(['BEARER_TOKEN']);
    });

    it('should extract env vars from array args', () => {
      const route = {
        src: '/home',
        transforms: [
          {
            type: 'request.headers' as const,
            op: 'append' as const,
            target: { key: 'session-temp' },
            args: ['$REGION', '$DATACENTER'],
          },
        ],
      };

      router.route(route);

      expect(route.transforms[0].env).toEqual(['REGION', 'DATACENTER']);
    });
  });
});
