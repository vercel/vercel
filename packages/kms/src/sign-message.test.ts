import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { signMessage } from './sign-message';

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

const OIDC_TOKEN = 'oidc-token';
const SIGNATURE_B64 = 'c2lnbmF0dXJl';
const SIGNATURE_BYTES = new Uint8Array([
  115, 105, 103, 110, 97, 116, 117, 114, 101,
]);
const SIGNED_MESSAGE = {
  signature: SIGNATURE_B64,
  keyId: 'key_a',
  algorithm: 'EdDSA',
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

describe('signMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getVercelOidcTokenMock.mockReset();
    // Keep default-host URL assertions stable regardless of the runner's env.
    delete process.env.VERCEL_REGION;
  });

  test('signs a string message (UTF-8) and returns the raw signature', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning(SIGNED_MESSAGE));

    const result = await signMessage({
      issuerId: 'issuer_a',
      message: 'hello',
    });

    expect(result).toEqual({
      signature: SIGNATURE_BYTES,
      keyId: 'key_a',
      algorithm: 'EdDSA',
      fingerprint: 'SHA256:test',
    });
    expect(getVercelOidcTokenMock).toHaveBeenCalledWith();
    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://api.vercel.com/v1/kms/issuers/issuer_a/sign/message'
    );
    // The raw string is UTF-8 encoded, then base64-encoded before sending.
    expect(JSON.parse(init?.body as string)).toEqual({ message: 'aGVsbG8=' });
  });

  test('base64-encodes a Uint8Array message before sending', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning(SIGNED_MESSAGE));

    await signMessage({
      issuerId: 'issuer_bytes',
      // Raw bytes for "hello".
      message: new Uint8Array([104, 101, 108, 108, 111]),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ message: 'aGVsbG8=' });
  });

  test('targets the regional host when a region is provided', async () => {
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning(SIGNED_MESSAGE));

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

  test('uses an explicit token without fetching an OIDC token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchReturning(SIGNED_MESSAGE));

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
    getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
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
