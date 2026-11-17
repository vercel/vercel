import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectError,
  ConnectorInstallationRequiredError,
  deleteTokenCacheEntry,
  getTokenResponse,
  NoValidTokenError,
  revokeToken,
  UserAuthorizationRequiredError,
  type ConnectTokenParams,
} from '../src/token.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

// The token cache is module state shared by every test in this file, so
// each test uses its own subject ids to stay independent.
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getVercelOidcToken).mockReset().mockResolvedValue('oidc_token');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('token cache isolation', () => {
  it('keeps tokens fetched with different Vercel credentials apart', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('team_a_token'))
      .mockResolvedValueOnce(tokenResponse('team_b_token'));
    const params = { subject: { type: 'app' as const } };

    const teamA = await getTokenResponse('oauth/isolation', params, {
      vercelToken: 'team_a_oidc',
    });
    const teamB = await getTokenResponse('oauth/isolation', params, {
      vercelToken: 'team_b_oidc',
    });

    expect(teamA.token).toBe('team_a_token');
    expect(teamB.token).toBe('team_b_token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationHeader(1)).toBe('Bearer team_b_oidc');
  });

  it('keeps an explicit Vercel credential apart from the ambient OIDC token', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('ambient_token'))
      .mockResolvedValueOnce(tokenResponse('explicit_token'));
    const params = {
      subject: { type: 'user' as const, id: 'ambient_vs_explicit' },
    };

    await getTokenResponse('oauth/isolation', params);
    const explicit = await getTokenResponse('oauth/isolation', params, {
      vercelToken: 'other_project_oidc',
    });

    expect(explicit.token).toBe('explicit_token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the cache for repeated calls with the same explicit credential', async () => {
    fetchMock.mockResolvedValue(tokenResponse('same_credential_token'));
    const params = {
      subject: { type: 'user' as const, id: 'same_credential' },
    };

    await getTokenResponse('oauth/isolation', params, {
      vercelToken: 'oidc_x',
    });
    await getTokenResponse('oauth/isolation', params, {
      vercelToken: 'oidc_x',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not read the ambient OIDC token on a cache hit', async () => {
    fetchMock.mockResolvedValue(tokenResponse('oidc_once_token'));
    const params = { subject: { type: 'user' as const, id: 'oidc_once' } };

    await getTokenResponse('oauth/isolation', params);
    await getTokenResponse('oauth/isolation', params);

    expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<ConnectTokenParams> & { connector?: string }]>([
    ['connector', { connector: 'oauth/isolation-other' }],
    ['installationId', { installationId: 'icfg_other' }],
    ['scopes', { scopes: ['read'] }],
    ['audience', { audience: ['https://other.example.com'] }],
    ['resources', { resources: ['https://mcp.example.com'] }],
    [
      'user issuer',
      {
        subject: {
          type: 'user',
          id: 'field_split',
          issuer: 'https://idp.example.com',
        },
      },
    ],
    [
      'IDP connector',
      {
        subject: {
          type: 'user',
          id: 'field_split',
          experimental_idp: 'oidc/okta',
        },
      },
    ],
    [
      'authorization details',
      { authorizationDetails: [{ type: 'payment_initiation' } as never] },
    ],
  ])('keeps requests that differ by %s in separate entries', async (_name, change) => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('base_token'))
      .mockResolvedValueOnce(tokenResponse('changed_token'));
    const base: ConnectTokenParams = {
      subject: { type: 'user', id: 'field_split' },
    };
    const { connector = 'oauth/isolation', ...paramChange } = change;

    await getTokenResponse('oauth/isolation', base);
    const changed = await getTokenResponse(connector, {
      ...base,
      ...paramChange,
    });

    expect(changed.token).toBe('changed_token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    deleteTokenCacheEntry('oauth/isolation', base);
    deleteTokenCacheEntry(connector, { ...base, ...paramChange });
  });

  it('keeps the app subject apart from a user subject on the same connector', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('app_token'))
      .mockResolvedValueOnce(tokenResponse('user_token'));

    await getTokenResponse('oauth/subject-split', { subject: { type: 'app' } });
    const user = await getTokenResponse('oauth/subject-split', {
      subject: { type: 'user', id: 'subject_split' },
    });

    expect(user.token).toBe('user_token');
  });
});

describe('deleteTokenCacheEntry across Vercel credentials', () => {
  it('drops only the entry for the given credential', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('a_old'))
      .mockResolvedValueOnce(tokenResponse('b_cached'))
      .mockResolvedValueOnce(tokenResponse('a_new'));
    const params = { subject: { type: 'user' as const, id: 'delete_scoped' } };

    await getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_a' });
    await getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_b' });
    deleteTokenCacheEntry('oauth/delete', params, { vercelToken: 'oidc_a' });

    await expect(
      getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_a' })
    ).resolves.toMatchObject({ token: 'a_new' });
    await expect(
      getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_b' })
    ).resolves.toMatchObject({ token: 'b_cached' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('drops the entry for every credential when no options are given', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('ambient_old'))
      .mockResolvedValueOnce(tokenResponse('explicit_old'))
      .mockResolvedValueOnce(tokenResponse('ambient_new'))
      .mockResolvedValueOnce(tokenResponse('explicit_new'));
    const params = { subject: { type: 'user' as const, id: 'delete_all' } };

    await getTokenResponse('oauth/delete', params);
    await getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_c' });
    deleteTokenCacheEntry('oauth/delete', params);

    await expect(
      getTokenResponse('oauth/delete', params)
    ).resolves.toMatchObject({
      token: 'ambient_new',
    });
    await expect(
      getTokenResponse('oauth/delete', params, { vercelToken: 'oidc_c' })
    ).resolves.toMatchObject({ token: 'explicit_new' });
  });
});

describe('token expiry', () => {
  it('re-fetches a cached token that expires within the default 30s buffer', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('near_expiry', 20_000))
      .mockResolvedValueOnce(tokenResponse('fresh'));
    const params = { subject: { type: 'user' as const, id: 'default_buffer' } };

    await getTokenResponse('oauth/expiry', params);
    const second = await getTokenResponse('oauth/expiry', params);

    expect(second.token).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a cached token until it reaches the buffer, then re-fetches', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T00:00:00Z') });
    fetchMock
      .mockResolvedValueOnce(tokenResponse('first', 120_000))
      .mockResolvedValueOnce(tokenResponse('second'));
    const params = { subject: { type: 'user' as const, id: 'buffer_edge' } };

    await getTokenResponse('oauth/expiry', params);
    vi.advanceTimersByTime(89_000);
    await expect(
      getTokenResponse('oauth/expiry', params)
    ).resolves.toMatchObject({
      token: 'first',
    });
    vi.advanceTimersByTime(1_000);
    await expect(
      getTokenResponse('oauth/expiry', params)
    ).resolves.toMatchObject({
      token: 'second',
    });
  });

  it('honors a custom validityBufferMs', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('custom_first', 5 * 60_000))
      .mockResolvedValueOnce(tokenResponse('custom_second'));
    const params = {
      subject: { type: 'user' as const, id: 'custom_buffer' },
      validityBufferMs: 10 * 60_000,
    };

    await getTokenResponse('oauth/expiry', params);
    const second = await getTokenResponse('oauth/expiry', params);

    expect(second.token).toBe('custom_second');
  });

  it('fails instead of serving an expired token when the refresh request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('expired', 1_000))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'internal_error' } }, { status: 503 })
      )
      .mockResolvedValueOnce(tokenResponse('recovered'));
    const params = {
      subject: { type: 'user' as const, id: 'expired_then_error' },
    };

    await getTokenResponse('oauth/expiry', params);
    await expect(
      getTokenResponse('oauth/expiry', params)
    ).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      getTokenResponse('oauth/expiry', params)
    ).resolves.toMatchObject({
      token: 'recovered',
    });
  });
});

describe('token cache eviction', () => {
  it('evicts the least recently used entry once 100 entries are cached', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T00:00:00Z') });
    fetchMock.mockImplementation(async () => tokenResponse('lru'));
    const params = (i: number) => ({
      subject: { type: 'user' as const, id: `lru_${i}` },
    });
    // Clear entries from earlier tests so the cache holds exactly ours.
    await revokeToken('oauth/lru', params(-1));
    fetchMock.mockClear();

    for (let i = 0; i < 100; i++) {
      await getTokenResponse('oauth/lru', params(i));
      vi.advanceTimersByTime(1);
    }
    // Touch entry 0 so entry 1 becomes the least recently used.
    await getTokenResponse('oauth/lru', params(0));
    vi.advanceTimersByTime(1);
    await getTokenResponse('oauth/lru', params(100));
    expect(fetchMock).toHaveBeenCalledTimes(101);

    await getTokenResponse('oauth/lru', params(0));
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await getTokenResponse('oauth/lru', params(1));
    expect(fetchMock).toHaveBeenCalledTimes(102);
  });
});

describe('revokeToken and the cache', () => {
  it('clears cached tokens after a successful revoke', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('before_revoke'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(tokenResponse('after_revoke'));
    const params = { subject: { type: 'user' as const, id: 'revoke_clears' } };

    await getTokenResponse('oauth/revoke', params);
    await revokeToken('oauth/revoke', params);

    await expect(
      getTokenResponse('oauth/revoke', params)
    ).resolves.toMatchObject({
      token: 'after_revoke',
    });
  });

  it('keeps cached tokens when the revoke request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('kept'))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'forbidden' } }, { status: 403 })
      );
    const params = { subject: { type: 'user' as const, id: 'revoke_fails' } };

    await getTokenResponse('oauth/revoke', params);
    await expect(revokeToken('oauth/revoke', params)).rejects.toBeInstanceOf(
      ConnectError
    );
    await expect(
      getTokenResponse('oauth/revoke', params)
    ).resolves.toMatchObject({
      token: 'kept',
    });
  });
});

describe('token error classification', () => {
  it.each([
    ['no_token', NoValidTokenError, 404],
    ['user_authorization_required', UserAuthorizationRequiredError, 401],
    [
      'connector_installation_required',
      ConnectorInstallationRequiredError,
      412,
    ],
    ['client_installation_required', ConnectorInstallationRequiredError, 412],
  ] as const)('maps %s to %s with status and code', async (code, ErrorClass, status) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code, message: `server says ${code}` } },
        { status, statusText: 'Nope' }
      )
    );

    const error = await getTokenResponse('oauth/errors', {
      subject: { type: 'user', id: `classify_${code}` },
    }).catch(e => e);

    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toBeInstanceOf(ConnectError);
    expect(error).toMatchObject({
      code,
      status,
      statusText: 'Nope',
      message: `server says ${code}`,
    });
  });

  it('falls back to a default message when a classified error has no message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'no_token' } }, { status: 404 })
    );

    const error = await getTokenResponse('oauth/errors', {
      subject: { type: 'user', id: 'classify_default_message' },
    }).catch(e => e);

    expect(error).toBeInstanceOf(NoValidTokenError);
    expect(error.message).toContain('no_token');
  });

  it('reads the legacy `err` envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          err: {
            code: 'user_authorization_required',
            message: 'consent needed',
          },
        },
        { status: 401 }
      )
    );

    await expect(
      getTokenResponse('oauth/errors', {
        subject: { type: 'user', id: 'classify_err_envelope' },
      })
    ).rejects.toBeInstanceOf(UserAuthorizationRequiredError);
  });

  it('preserves vendor payloads from error.vendor and error.meta.vendor', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 'upstream_error',
              vendor: { error: 'invalid_grant' },
            },
          },
          { status: 502 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: 'upstream_error',
              meta: { vendor: { error: 'slow_down' } },
            },
          },
          { status: 502 }
        )
      );

    await expect(
      getTokenResponse('oauth/errors', {
        subject: { type: 'user', id: 'vendor_direct' },
      })
    ).rejects.toMatchObject({ vendor: { error: 'invalid_grant' } });
    await expect(
      getTokenResponse('oauth/errors', {
        subject: { type: 'user', id: 'vendor_meta' },
      })
    ).rejects.toMatchObject({ vendor: { error: 'slow_down' } });
  });

  it('includes status and body text for a non-JSON error response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const error = await getTokenResponse('oauth/errors', {
      subject: { type: 'user', id: 'non_json_error' },
    }).catch(e => e);

    expect(error).toBeInstanceOf(ConnectError);
    expect(error.constructor).toBe(ConnectError);
    expect(error.status).toBe(502);
    expect(error.message).toBe(
      'Failed to get token: 502 Bad Gateway  - <html>bad gateway</html>'
    );
  });

  it('handles an empty error response body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: 'Internal Server Error' })
    );

    await expect(
      getTokenResponse('oauth/errors', {
        subject: { type: 'user', id: 'empty_error' },
      })
    ).rejects.toMatchObject({
      status: 500,
      message: 'Failed to get token: 500 Internal Server Error',
    });
  });

  it('surfaces a 429 as a ConnectError and does not cache the failure', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'rate_limited', message: 'Too many requests' } },
          { status: 429, headers: { 'Retry-After': '2' } }
        )
      )
      .mockResolvedValueOnce(tokenResponse('after_rate_limit'));
    const params = { subject: { type: 'user' as const, id: 'rate_limited' } };

    await expect(
      getTokenResponse('oauth/errors', params)
    ).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    });
    // The SDK does not retry on its own; the next call goes back to Connect.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(
      getTokenResponse('oauth/errors', params)
    ).resolves.toMatchObject({
      token: 'after_rate_limit',
    });
  });

  it('propagates an OIDC token failure without calling Connect', async () => {
    vi.mocked(getVercelOidcToken).mockRejectedValueOnce(
      new Error('no OIDC token')
    );

    await expect(
      getTokenResponse('oauth/errors', {
        subject: { type: 'user', id: 'oidc_failure' },
      })
    ).rejects.toThrow('no OIDC token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('successful token response validation', () => {
  it('rejects a 200 response without a token and does not cache it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          expiresAt: Date.now() + 3_600_000,
          connector: { id: 'scl_1', uid: 'oauth/linear', type: 'oauth' },
        })
      )
      .mockResolvedValueOnce(tokenResponse('valid_after_bad'));
    const params = { subject: { type: 'user' as const, id: 'missing_token' } };

    await expect(
      getTokenResponse('oauth/validate', params)
    ).rejects.toBeInstanceOf(ConnectError);
    await expect(
      getTokenResponse('oauth/validate', params)
    ).resolves.toMatchObject({
      token: 'valid_after_bad',
    });
  });

  it('rejects a 200 response without a numeric expiresAt', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        token: 'tok_no_expiry',
        connector: { id: 'scl_1', uid: 'oauth/linear', type: 'oauth' },
      })
    );

    await expect(
      getTokenResponse('oauth/validate', {
        subject: { type: 'user', id: 'missing_expiry' },
      })
    ).rejects.toBeInstanceOf(ConnectError);
  });

  it('wraps a non-JSON 200 response in a ConnectError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>login</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const error = await getTokenResponse('oauth/validate', {
      subject: { type: 'user', id: 'non_json_success' },
    }).catch(e => e);

    expect(error).toBeInstanceOf(ConnectError);
    expect(error.status).toBe(200);
  });
});

function authorizationHeader(call: number): string | undefined {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return (init.headers as Record<string, string>).Authorization;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function tokenResponse(token: string, ttlMs = 60 * 60 * 1000): Response {
  return jsonResponse({
    token,
    expiresAt: Date.now() + ttlMs,
    connector: { id: 'scl_1', uid: 'oauth/linear', type: 'oauth' },
  });
}
