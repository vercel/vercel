import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getVercelOidcTokenSync } from '../../../src/oidc';
import { randomUUID } from 'node:crypto';

describe('getVercelOidcTokenSync', () => {
  describe('when VERCEL_OIDC_TOKEN is present in the environment variables', () => {
    const token = randomUUID();

    beforeEach(() => {
      process.env.VERCEL_OIDC_TOKEN = token;
    });
    afterEach(() => {
      // biome-ignore lint/performance/noDelete: necessary for test cleanup
      delete process.env.VERCEL_OIDC_TOKEN;
    });

    it('returns the OIDC token', () => {
      expect(getVercelOidcTokenSync()).toEqual(token);
    });
  });

  describe('when loading from the request context', () => {
    const token = randomUUID();

    beforeEach(() => {
      globalThis[
        // @ts-ignore
        Symbol.for(
          '@vercel/request-context'
        ) as unknown as keyof typeof globalThis
      ] = {
        get: () => ({ headers: { 'x-vercel-oidc-token': token } }),
      };
    });

    afterEach(() => {
      delete globalThis[
        Symbol.for(
          '@vercel/request-context'
        ) as unknown as keyof typeof globalThis
      ];
    });

    it('returns the OIDC token', () => {
      expect(getVercelOidcTokenSync()).toEqual(token);
    });
  });

  describe('load order', () => {
    const tokenFromEnv = randomUUID();
    const tokenFromContext = randomUUID();

    beforeEach(() => {
      process.env.VERCEL_OIDC_TOKEN = tokenFromEnv;

      globalThis[
        // @ts-ignore
        Symbol.for(
          '@vercel/request-context'
        ) as unknown as keyof typeof globalThis
      ] = {
        get: () => ({ headers: { 'x-vercel-oidc-token': tokenFromContext } }),
      };
    });
    afterEach(() => {
      // biome-ignore lint/performance/noDelete: necessary for test cleanup
      delete process.env.VERCEL_OIDC_TOKEN;
      delete globalThis[
        Symbol.for(
          '@vercel/request-context'
        ) as unknown as keyof typeof globalThis
      ];
    });

    it('prefers the request context over the environment variable', () => {
      expect(getVercelOidcTokenSync()).toEqual(tokenFromContext);
    });
  });

  describe('when neither the environment variables or the request context is present', () => {
    it('throws an error', () => {
      expect(() => getVercelOidcTokenSync()).toThrow(
        /The 'x-vercel-oidc-token' header is missing from the request/
      );
    });
  });
});
