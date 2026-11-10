import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { signToken } from './sign-token';

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

const OIDC_TOKEN = 'oidc-token';
const SIGNED_JWT = {
  token: 'signed.jwt.token',
  keyId: 'key_a',
  algorithm: 'ES256',
  fingerprint: 'SHA256:test',
};

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
    delete process.env.VERCEL_REGION;
  });

  test('returns the compact JWT string from the signJWT response', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      fetchReturning(SIGNED_JWT)
    );

    await expect(
      signToken({
        issuerId: 'issuer_a',
        claims: { sub: 'user' },
      })
    ).resolves.toBe(SIGNED_JWT.token);
  });
});
