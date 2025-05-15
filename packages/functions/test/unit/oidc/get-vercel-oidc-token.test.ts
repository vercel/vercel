import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getVercelOidcToken } from '../../../src/oidc';
import { randomUUID } from 'node:crypto';

describe('getVercelOidcToken', () => {
  describe('when VERCEL_OIDC_TOKEN is present in the environment variables', () => {
    const token = randomUUID();

    beforeEach(() => {
      process.env.VERCEL_OIDC_TOKEN = token;
    });
    afterEach(() => {
      // biome-ignore lint/performance/noDelete: necessary for test cleanup
      delete process.env.VERCEL_OIDC_TOKEN;
    });

    it('returns the OIDC token', async () => {
      await expect(getVercelOidcToken()).resolves.toEqual(token);
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

    it('returns the OIDC token', async () => {
      await expect(getVercelOidcToken()).resolves.toEqual(token);
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

    it('prefers the request context over the environment variable', async () => {
      await expect(getVercelOidcToken()).resolves.toEqual(tokenFromContext);
    });
  });

  describe('when neither the environment variables or the request context is present', () => {
    it('throws an error', async () => {
      await expect(getVercelOidcToken()).rejects.toThrow(
        /The 'x-vercel-oidc-token' header is missing from the request/
      );
    });
  });
});
