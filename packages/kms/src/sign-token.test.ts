import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { signToken } from './sign-token';
import { VercelKmsError } from './errors';

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

const OIDC_TOKEN = 'oidc-token';
const SIGNED_TOKEN = 'signed.jwt.token';

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
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: SIGNED_TOKEN }));

    const result = await signToken({
      issuerId: 'issuer_a',
      claims: { sub: 'user' },
    });

    expect(result).toBe(SIGNED_TOKEN);
    expect(getVercelOidcTokenMock).toHaveBeenCalledWith();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api.vercel.com/v1/kms/issuers/issuer_a/sign/token'
    );
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${OIDC_TOKEN}`
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      claims: { sub: 'user' },
      headers: {},
      ttl: 300,
    });
  });

  test('targets the regional host when a region is provided', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: SIGNED_TOKEN }));

    await signToken({ issuerId: 'issuer_region', region: 'sfo1' });

    const [url] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api-sfo1.vercel.com/v1/kms/issuers/issuer_region/sign/token'
    );
  });

  test('uses an explicit token without fetching an OIDC token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning({ token: SIGNED_TOKEN }));

    await signToken({ issuerId: 'issuer_explicit', token: 'my-token' });

    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer my-token'
    );
  });

  test('throws a VercelKmsError mapping the API error envelope', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
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
