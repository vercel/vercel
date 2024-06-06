import { getVercelOidcToken } from '../src';
import { randomUUID } from 'crypto';

describe('when VERCEL_OIDC_TOKEN is present in the environment variables', () => {
  const token = randomUUID();

  beforeEach(() => {
    process.env.VERCEL_OIDC_TOKEN = token;
  });
  afterEach(() => {
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  it('returns the OIDC token', () => {
    expect(getVercelOidcToken()).toEqual(token);
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
    expect(getVercelOidcToken()).toEqual(token);
  });
});

describe('when neither the environment variables or the request context is present', () => {
  it('throws an error', () => {
    expect(() => getVercelOidcToken()).toThrow(
      /The 'x-vercel-oidc-token' header is missing from the request/
    );
  });
});
