import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { signMessage } from './sign-message';
import type { FlattenedJWS } from './request';

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

function base64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.sig`;
}

function freshOidcToken(): string {
  return makeJwt({ exp: 4_000_000_000, jti: crypto.randomUUID() });
}

const SIGNATURE: FlattenedJWS = {
  payload: 'cGF5bG9hZA',
  signature: 'c2ln',
  protected: 'cHJvdGVjdGVk',
};

/**
 * Returns a fetch mock implementation that produces a fresh `Response` on every
 * call, so the body isn't consumed across repeated invocations.
 */
function fetchReturning(body: unknown, init?: ResponseInit) {
  return async () =>
    new Response(JSON.stringify(body), { status: 200, ...init });
}

describe('signMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getVercelOidcTokenMock.mockReset();
    // Keep default-host URL assertions stable regardless of the runner's env.
    delete process.env.VERCEL_REGION;
  });

  test('signs a message and returns the flattened JWS', async () => {
    const oidc = freshOidcToken();
    getVercelOidcTokenMock.mockResolvedValue(oidc);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    const result = await signMessage({
      issuerId: 'issuer_a',
      message: 'aGVsbG8=',
    });

    expect(result).toEqual(SIGNATURE);
    expect(getVercelOidcTokenMock).toHaveBeenCalledWith();
    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api.vercel.com/v1/kms/issuers/issuer_a/sign/message'
    );
    expect(JSON.parse(init?.body as string)).toEqual({ message: 'aGVsbG8=' });
  });

  test('targets the regional host when a region is provided', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    await signMessage({
      issuerId: 'issuer_region',
      message: 'bXNn',
      region: 'sfo1',
    });

    const [url] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api-sfo1.vercel.com/v1/kms/issuers/issuer_region/sign/message'
    );
  });

  test('caches the result for identical inputs', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    const options = { issuerId: 'issuer_cache', message: 'bXNn' };
    await signMessage(options);
    await signMessage(options);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('skipCache forces a fresh signature', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    const options = {
      issuerId: 'issuer_skip',
      message: 'bXNn',
      skipCache: true,
    };
    await signMessage(options);
    await signMessage(options);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('does not cache when the OIDC token has no expiry', async () => {
    getVercelOidcTokenMock.mockResolvedValue(makeJwt({ jti: 'no-exp' }));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    const options = { issuerId: 'issuer_noexp', message: 'bXNn' };
    await signMessage(options);
    await signMessage(options);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('uses an explicit token without fetching an OIDC token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ signature: SIGNATURE }));

    await signMessage({
      issuerId: 'issuer_explicit',
      message: 'bXNn',
      token: 'my-token',
    });

    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer my-token'
    );
  });

  test('throws a VercelKmsError when message signing is not allowed', async () => {
    getVercelOidcTokenMock.mockResolvedValue(freshOidcToken());
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      fetchReturning(
        {
          error: {
            code: 'message_signing_not_allowed',
            message: 'use sign-token',
          },
        },
        { status: 403, statusText: 'Forbidden' }
      )
    );

    await expect(
      signMessage({ issuerId: 'x', message: 'bXNn' })
    ).rejects.toMatchObject({
      name: 'VercelKmsError',
      status: 403,
      code: 'message_signing_not_allowed',
    });
  });
});
