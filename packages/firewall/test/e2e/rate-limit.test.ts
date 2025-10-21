import { expect, describe, test, beforeEach, afterEach } from 'vitest';
import { checkRateLimit as checkRateLimitSrc } from '../../src';
import { checkRateLimit as checkRateLimitDist } from '../../dist';
import { unstable_checkRateLimit as checkRateLimitDistUnstable } from '../../dist';

const origFetch = fetch;
const HOST = 'ratelimit-api-demo.vercel.app';

describe('checkRateLimit src', testWithCheckRateLimit(checkRateLimitSrc));
describe('checkRateLimit dist', testWithCheckRateLimit(checkRateLimitDist));
describe(
  'checkRateLimit dist legacy unstable',
  testWithCheckRateLimit(checkRateLimitDistUnstable)
);

function testWithCheckRateLimit(checkRateLimit: typeof checkRateLimitDist) {
  return () => {
    let rand: number;
    function check(key?: string) {
      return checkRateLimit('test-rule1', {
        rateLimitKey: (key || '123') + rand,
        headers: new Headers({
          host: HOST,
        }),
        firewallHostForDevelopment: 'ignore-for-testing',
      });
    }

    let fetchCalls: { url: string; init: RequestInit | undefined }[] = [];

    beforeEach(() => {
      rand = Math.random();
      fetchCalls = [];

      globalThis.fetch = function (url: string, init?: RequestInit) {
        fetchCalls.push({ url, init });
        return origFetch.call(this, url, init);
      } as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = origFetch;
    });

    test('Should allow but communicate if rate limit ID was not found', async () => {
      const { rateLimited, error } = await checkRateLimit(
        'definitely-not-found',
        {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123',
          headers: new Headers(),
        }
      );
      expect(rateLimited).toBe(false);
      expect(error).toBe('not-found');
    });

    async function testWithCheck(
      check: (key?: string) => Promise<{ rateLimited: boolean }>
    ) {
      const { rateLimited: rateLimited1 } = await check();
      expect(rateLimited1).toBe(false);
      const { rateLimited: rateLimited2 } = await check();
      expect(rateLimited2).toBe(false);
      const { rateLimited: rateLimited3 } = await check();
      expect(rateLimited3).toBe(true);
      const { rateLimited: rateLimited4 } = await check();
      expect(rateLimited4).toBe(true);

      const { rateLimited: differentKey } = await check('456');
      expect(differentKey).toBe(false);
      expect(fetchCalls).toHaveLength(5);
    }

    test('Should indicate a rate limit after 2 requests', async () => {
      await testWithCheck(check);

      const headers = new Headers(fetchCalls[0].init?.headers);
      expect(headers.get('user-agent')).toBe('Bot/Vercel Rate Limit Checker');
    });

    test('Should pick key from Headers object', async () => {
      function check(ip?: string) {
        return checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          headers: new Headers({
            'x-real-ip': (ip || '192.168.10.2') + rand,
          }),
        });
      }

      await testWithCheck(check);
    });

    test('Should pick key from headers-shaped object', async () => {
      function check(ip?: string) {
        return checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          headers: {
            'x-real-ip': (ip || '192.168.10.2') + rand,
            'random-header': 'random-value',
          },
        });
      }

      await testWithCheck(check);
      expect(fetchCalls.length).toBe(5);

      const headers = new Headers(fetchCalls[0].init?.headers);

      expect(headers.get('x-rr-random-header')).toBe('random-value');
      expect(headers.get('x-rr-x-real-ip')).toBe('192.168.10.2' + rand);
      expect(headers.get('user-agent')).toBe('Bot/Vercel Rate Limit Checker');
    });

    test('Should pick key from request object', async () => {
      function check(ip?: string) {
        return checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          request: new Request('https://example.com', {
            headers: new Headers({
              'x-real-ip': (ip || '192.168.10.2') + rand,
            }),
          }),
        });
      }

      await testWithCheck(check);
    });

    test('Should forward _vercel_jwt cookie when present', async () => {
      const { rateLimited } = await checkRateLimit('test-rule1', {
        firewallHostForDevelopment: HOST,
        rateLimitKey: '123' + rand,
        headers: new Headers({
          cookie: '_vercel_jwt=test-jwt-token; other=value',
        }),
      });

      expect(rateLimited).toBe(false);
      expect(fetchCalls).toHaveLength(1);

      const headers = new Headers(fetchCalls[0].init?.headers);
      expect(headers.get('cookie')).toBe('_vercel_jwt=test-jwt-token');
    });

    test('Should not add cookie header when _vercel_jwt is not present', async () => {
      const { rateLimited } = await checkRateLimit('test-rule1', {
        firewallHostForDevelopment: HOST,
        rateLimitKey: '123' + rand,
        headers: new Headers({
          cookie: 'other=value; session=abc123',
        }),
      });

      expect(rateLimited).toBe(false);
      expect(fetchCalls).toHaveLength(1);

      const headers = new Headers(fetchCalls[0].init?.headers);
      expect(headers.get('cookie')).toBeNull();
    });

    test('Should handle empty cookie header', async () => {
      const { rateLimited } = await checkRateLimit('test-rule1', {
        firewallHostForDevelopment: HOST,
        rateLimitKey: '123' + rand,
        headers: new Headers(),
      });

      expect(rateLimited).toBe(false);
      expect(fetchCalls).toHaveLength(1);

      const headers = new Headers(fetchCalls[0].init?.headers);
      expect(headers.get('cookie')).toBeNull();
    });

    test('Should use headers from SYMBOL_FOR_REQ_CONTEXT when no headers provided', async () => {
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const originalGlobalThis = globalThis as any;
      const mockContext = {
        headers: {
          'x-real-ip': '10.0.0.1' + rand,
          host: HOST,
          cookie: '_vercel_jwt=context-jwt-token',
        },
      };

      originalGlobalThis[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => mockContext,
      };

      try {
        const { rateLimited } = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: 'ignore-for-testing',
          rateLimitKey: '123' + rand,
        });

        expect(rateLimited).toBe(false);
        expect(fetchCalls).toHaveLength(1);

        const headers = new Headers(fetchCalls[0].init?.headers);
        expect(headers.get('x-real-ip')).toBe('10.0.0.1' + rand);
        expect(headers.get('cookie')).toBe('_vercel_jwt=context-jwt-token');
        expect(headers.get('x-rr-host')).toBe(HOST);
      } finally {
        delete originalGlobalThis[SYMBOL_FOR_REQ_CONTEXT];
      }
    });

    test('Should handle missing context when no headers provided', async () => {
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const originalGlobalThis = globalThis as any;
      delete originalGlobalThis[SYMBOL_FOR_REQ_CONTEXT];

      await expect(
        checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
        })
      ).rejects.toThrow('`headers` or `request` options are required');
    });

    test('Should parse and return rate limiting headers when present', async () => {
      const origFetch = globalThis.fetch;

      // Mock a successful response with rate limiting headers
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 204, // Not rate limited
          headers: new Headers({
            'ratelimit-limit': '100',
            'ratelimit-remaining': '95',
            'ratelimit-reset': '1640995200', // Unix timestamp
            'retry-after': '60',
          }),
        });
      };

      try {
        const result = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
          headers: new Headers(),
        });

        expect(result.rateLimited).toBe(false);
        expect(result.rateLimitHeaders).toBeDefined();
        expect(result.rateLimitHeaders?.limit).toBe(100);
        expect(result.rateLimitHeaders?.remaining).toBe(95);
        expect(result.rateLimitHeaders?.reset).toBe(1640995200);
        expect(result.rateLimitHeaders?.retryAfter).toBe(60);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('Should parse rate limiting headers with x-ratelimit prefix', async () => {
      const origFetch = globalThis.fetch;

      // Mock response with x-ratelimit prefixed headers
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 429, // Rate limited
          headers: new Headers({
            'x-ratelimit-limit': '50',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1640998800',
            'retry-after': '120',
          }),
        });
      };

      try {
        const result = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
          headers: new Headers(),
        });

        expect(result.rateLimited).toBe(true);
        expect(result.rateLimitHeaders).toBeDefined();
        expect(result.rateLimitHeaders?.limit).toBe(50);
        expect(result.rateLimitHeaders?.remaining).toBe(0);
        expect(result.rateLimitHeaders?.reset).toBe(1640998800);
        expect(result.rateLimitHeaders?.retryAfter).toBe(120);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('Should handle responses without rate limiting headers', async () => {
      const origFetch = globalThis.fetch;

      // Mock response without any rate limiting headers
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 204,
          headers: new Headers({
            'content-type': 'application/json',
          }),
        });
      };

      try {
        const result = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
          headers: new Headers(),
        });

        expect(result.rateLimited).toBe(false);
        expect(result.rateLimitHeaders).toBeUndefined();
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('Should handle partial rate limiting headers', async () => {
      const origFetch = globalThis.fetch;

      // Mock response with only some rate limiting headers
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 429,
          headers: new Headers({
            'ratelimit-reset': '1640999400',
            // Missing limit, remaining, and retry-after
          }),
        });
      };

      try {
        const result = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
          headers: new Headers(),
        });

        expect(result.rateLimited).toBe(true);
        expect(result.rateLimitHeaders).toBeDefined();
        expect(result.rateLimitHeaders?.reset).toBe(1640999400);
        expect(result.rateLimitHeaders?.limit).toBeUndefined();
        expect(result.rateLimitHeaders?.remaining).toBeUndefined();
        expect(result.rateLimitHeaders?.retryAfter).toBeUndefined();
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test('Should handle invalid header values gracefully', async () => {
      const origFetch = globalThis.fetch;

      // Mock response with invalid numeric header values
      globalThis.fetch = async () => {
        return new Response(null, {
          status: 204,
          headers: new Headers({
            'ratelimit-limit': 'invalid',
            'ratelimit-remaining': 'also-invalid',
            'ratelimit-reset': '1640999999', // This one is valid
            'retry-after': 'not-a-number',
          }),
        });
      };

      try {
        const result = await checkRateLimit('test-rule1', {
          firewallHostForDevelopment: HOST,
          rateLimitKey: '123' + rand,
          headers: new Headers(),
        });

        expect(result.rateLimited).toBe(false);
        expect(result.rateLimitHeaders).toBeDefined();
        // Only the valid header should be parsed
        expect(result.rateLimitHeaders?.reset).toBe(1640999999);
        expect(result.rateLimitHeaders?.limit).toBeUndefined();
        expect(result.rateLimitHeaders?.remaining).toBeUndefined();
        expect(result.rateLimitHeaders?.retryAfter).toBeUndefined();
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  };
}
