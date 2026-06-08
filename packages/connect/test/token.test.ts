import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectError, deleteToken } from '../src/token.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const CONNECTOR = 'oauth/linear';
const PARAMS: Parameters<typeof deleteToken>[1] = {
  subject: { type: 'user', id: 'user_123' },
  installationId: 'icfg_123',
};
const RESULT = {
  tokensFound: 3,
  deleted: 3,
  providerRevoked: 2,
  providerSkipped: 1,
  providerFailed: 0,
};

describe('deleteToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deletes connector tokens for the required subject', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESULT));

    await expect(
      deleteToken(CONNECTOR, PARAMS, { vercelToken: 'vercel_token' })
    ).resolves.toBeUndefined();

    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.vercel.com/v1/connect/connectors/oauth%2Flinear/tokens'
    );
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer vercel_token',
    });
    expect(JSON.parse(init.body as string)).toEqual(PARAMS);
  });

  it('uses the Vercel OIDC token when no explicit token is provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESULT));

    await deleteToken(CONNECTOR, PARAMS);

    expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer oidc_token',
    });
  });

  it('allows empty successful delete responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteToken(CONNECTOR, PARAMS)).resolves.toBeUndefined();
  });

  it('maps API errors through ConnectError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'forbidden',
            message: 'Missing permission to delete tokens',
          },
        },
        { status: 403, statusText: 'Forbidden' }
      )
    );

    const promise = deleteToken(CONNECTOR, PARAMS);

    await expect(promise).rejects.toBeInstanceOf(ConnectError);
    await expect(promise).rejects.toMatchObject({
      name: 'ConnectError',
      code: 'forbidden',
      status: 403,
      statusText: 'Forbidden',
      message: 'Missing permission to delete tokens',
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}
