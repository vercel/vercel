import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { signToken } from './sign-token';
import { VercelKmsError } from './errors';

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

function base64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.sig`;
}

/** OIDC token expiring far in the future, unique per test to isolate the cache. */
function freshOidcToken(): string {
  return makeJwt({ exp: 4_000_000_000, jti: crypto.randomUUID() });
}

/**
 * Returns a fetch mock implementation that produces a fresh `Response` on every
 * call, so the body isn't consumed across repeated invocations.
 */
function fetchReturning(body: unknown, init?: ResponseInit) {
  return async () =>
    new Response(JSON.stringify(body), { status: 200, ...init });
}

describe('signToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getVercelOidcTokenMock.mockReset();
    // Keep default-host URL assertions stable regardless of the runner's env.
    delete process.env.VERCEL_REGION;
  });

  test('signs a token and returns the JWT string', async () => {
    const oidc = freshOidcToken();
    getVercelOidcTokenMock.mockResolvedValue(oidc);
    const signed = makeJwt({ exp: 4_000_000_000, sub: 'user' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: signed }));

    const result = await signToken({
      issuerId: 'issuer_a',
      claims: { sub: 'user' },
    });

    expect(result).toBe(signed);
    expect(getVercelOidcTokenMock).toHaveBeenCalledWith();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api.vercel.com/v1/kms/issuers/issuer_a/sign/token'
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${oidc}`
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      claims: { sub: 'user' },
      headers: {},
      ttl: 300,
    });
  });

  test('targets the regional host when a region is provided', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        fetchReturning({ token: makeJwt({ exp: 4_000_000_000 }) })
      );

    await signToken({ issuerId: 'issuer_region', region: 'sfo1' });

    const [url] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api-sfo1.vercel.com/v1/kms/issuers/issuer_region/sign/token'
    );
  });

  test('caches the result and does not re-fetch for identical inputs', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const signed = makeJwt({ exp: 4_000_000_000 });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: signed }));

    const options = { issuerId: 'issuer_cache', claims: { a: 1 } };
    const first = await signToken(options);
    const second = await signToken(options);

    expect(first).toBe(signed);
    expect(second).toBe(signed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('skipCache forces a fresh signature', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const signed = makeJwt({ exp: 4_000_000_000 });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: signed }));

    const options = { issuerId: 'issuer_skip', skipCache: true };
    await signToken(options);
    await signToken(options);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('does not cache when neither token carries an expiry', async () => {
    getVercelOidcTokenMock.mockResolvedValue(makeJwt({ jti: 'no-exp' }));
    const signed = makeJwt({ sub: 'user' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: signed }));

    const options = { issuerId: 'issuer_noexp' };
    await signToken(options);
    await signToken(options);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('uses an explicit token without fetching an OIDC token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        fetchReturning({ token: makeJwt({ exp: 4_000_000_000 }) })
      );

    await signToken({ issuerId: 'issuer_explicit', token: 'my-token' });

    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer my-token'
    );
  });

  test('throws a VercelKmsError mapping the API error envelope', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      fetchReturning(
        { error: { code: 'issuer_not_found', message: 'nope', issuerId: 'x' } },
        { status: 404, statusText: 'Not Found' }
      )
    );

    await expect(signToken({ issuerId: 'x' })).rejects.toMatchObject({
      name: 'VercelKmsError',
      status: 404,
      code: 'issuer_not_found',
      message: 'nope',
      metadata: { issuerId: 'x' },
    });
    await expect(signToken({ issuerId: 'x' })).rejects.toBeInstanceOf(
      VercelKmsError
    );
  });
});
