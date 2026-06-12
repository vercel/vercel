import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectError,
  deleteTokenCacheEntry,
  getTokenResponse,
  revokeToken,
  UserAuthorizationRequiredError,
} from '../src/token.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const CONNECTOR = 'oauth/linear';
const PARAMS: Parameters<typeof revokeToken>[1] = {
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

describe('revokeToken', () => {
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
      revokeToken(CONNECTOR, PARAMS, { vercelToken: 'vercel_token' })
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

    await revokeToken(CONNECTOR, PARAMS);

    expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer oidc_token',
    });
  });

  it('allows empty successful delete responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(revokeToken(CONNECTOR, PARAMS)).resolves.toBeUndefined();
  });

  it('maps API errors through ConnectError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'forbidden',
            message: 'Missing permission to revoke tokens',
          },
        },
        { status: 403, statusText: 'Forbidden' }
      )
    );

    const promise = revokeToken(CONNECTOR, PARAMS);

    await expect(promise).rejects.toBeInstanceOf(ConnectError);
    await expect(promise).rejects.toMatchObject({
      name: 'ConnectError',
      code: 'forbidden',
      status: 403,
      statusText: 'Forbidden',
      message: 'Missing permission to revoke tokens',
    });
  });
});

describe('getTokenResponse cache', () => {
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

  it('serves a cached, unexpired token without re-fetching', async () => {
    fetchMock.mockResolvedValue(tokenResponse('tok_a'));
    const params = { subject: { type: 'user' as const, id: 'cache_hit' } };

    const first = await getTokenResponse('oauth/linear', params);
    const second = await getTokenResponse('oauth/linear', params);

    expect(first.token).toBe('tok_a');
    expect(second.token).toBe('tok_a');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deleteTokenCacheEntry drops only the matching entry, forcing a re-fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('tok_evicted_old'))
      .mockResolvedValueOnce(tokenResponse('tok_other'))
      .mockResolvedValueOnce(tokenResponse('tok_evicted_new'));
    const evicted = { subject: { type: 'user' as const, id: 'evicted' } };
    const other = { subject: { type: 'user' as const, id: 'other' } };

    await getTokenResponse('oauth/linear', evicted);
    await getTokenResponse('oauth/linear', other);

    deleteTokenCacheEntry('oauth/linear', evicted);

    // The evicted principal re-fetches a fresh token; the untouched
    // principal still serves from cache (no third fetch for it).
    const refetched = await getTokenResponse('oauth/linear', evicted);
    const stillCached = await getTokenResponse('oauth/linear', other);

    expect(refetched.token).toBe('tok_evicted_new');
    expect(stillCached.token).toBe('tok_other');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('forceRefresh bypasses the cache and re-fetches', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('tok_old'))
      .mockResolvedValueOnce(tokenResponse('tok_new'));
    const params = { subject: { type: 'user' as const, id: 'force_refresh' } };

    const first = await getTokenResponse('oauth/linear', params);
    const second = await getTokenResponse('oauth/linear', params, {
      forceRefresh: true,
    });

    expect(first.token).toBe('tok_old');
    expect(second.token).toBe('tok_new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a revoked grant on re-check instead of serving the cached bearer', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('tok_live'));
    const params = { subject: { type: 'user' as const, id: 'revoked' } };

    await getTokenResponse('oauth/linear', params);

    // Grant revoked server-side: a cache-bypassing re-check now fails
    // closed instead of returning the still-cached, now-dead bearer.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'user_authorization_required',
            message: 'User authorization is required',
          },
        },
        { status: 401, statusText: 'Unauthorized' }
      )
    );

    await expect(
      getTokenResponse('oauth/linear', params, { forceRefresh: true })
    ).rejects.toBeInstanceOf(UserAuthorizationRequiredError);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function tokenResponse(token: string): Response {
  return jsonResponse({
    token,
    expiresAt: Date.now() + 60 * 60 * 1000,
    connector: { id: 'scl_1', uid: 'oauth/linear', type: 'oauth' },
  });
}
