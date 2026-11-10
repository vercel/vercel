import { getVercelOidcToken } from '@vercel/oidc';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  ConnectError,
  deleteTokenCacheEntry,
  getToken,
  getTokenResponse,
  revokeToken,
  UserAuthorizationRequiredError,
  type ConnectTokenSubject,
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

it('allows an omitted subject type only with a string token', () => {
  expectTypeOf<{ token: string }>().toMatchTypeOf<ConnectTokenSubject>();
  expectTypeOf<{ token: null }>().not.toMatchTypeOf<ConnectTokenSubject>();
  expectTypeOf<{ token: number }>().not.toMatchTypeOf<ConnectTokenSubject>();
  expectTypeOf<{ id: string }>().not.toMatchTypeOf<ConnectTokenSubject>();
  expectTypeOf<{}>().not.toMatchTypeOf<ConnectTokenSubject>();
});

describe('revokeToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockReset().mockResolvedValue('oidc_token');
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

  it('normalizes an implicit token subject when revoking tokens', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESULT));
    const identity = Object.freeze({
      token: 'revoke_passport.jwt',
      email: 'user@example.com',
    });

    await revokeToken(CONNECTOR, {
      subject: identity,
      installationId: 'icfg_123',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      subject: { type: 'token', token: identity.token },
      installationId: 'icfg_123',
    });
    expect(identity).not.toHaveProperty('type');
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
    vi.mocked(getVercelOidcToken).mockReset().mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults omitted scopes to all default scopes', async () => {
    fetchMock.mockResolvedValue(tokenResponse('tok_default_scopes'));

    await getTokenResponse('oauth/linear', {
      subject: { type: 'user', id: 'default_scopes' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ scopes: ['*'] });
  });

  it('preserves explicitly provided scopes', async () => {
    fetchMock.mockResolvedValue(tokenResponse('tok_explicit_scopes'));

    await getTokenResponse('oauth/linear', {
      subject: { type: 'user', id: 'explicit_scopes' },
      scopes: ['read', 'write'],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      scopes: ['read', 'write'],
    });
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

  it('sends token exchange subjects and uses them for cache keying', async () => {
    fetchMock.mockResolvedValue(tokenResponse('tok_passport'));

    const first = await getTokenResponse('oauth/linear', {
      subject: {
        type: 'token',
        token: 'passport.jwt',
      },
    });
    const second = await getTokenResponse('oauth/linear', {
      subject: {
        type: 'token',
        token: 'passport.jwt',
      },
    });

    expect(first.token).toBe('tok_passport');
    expect(second.token).toBe('tok_passport');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      subject: {
        type: 'token',
        token: 'passport.jwt',
      },
    });
  });

  it('accepts an identity directly and sends only the canonical token subject', async () => {
    fetchMock.mockResolvedValue(tokenResponse('tok_implicit_passport'));
    const identity = Object.freeze({
      token: 'implicit_passport.jwt',
      tokenSource: 'header',
      verified: true,
      subject: 'user_123',
      email: 'user@example.com',
      payload: { sub: 'user_123' },
    });

    await expect(
      getToken('slack/xaa-slack', { subject: identity, scopes: ['users:read'] })
    ).resolves.toBe('tok_implicit_passport');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.vercel.com/v1/connect/token/slack%2Fxaa-slack'
    );
    expect(JSON.parse(init.body as string)).toEqual({
      subject: { type: 'token', token: identity.token },
      scopes: ['users:read'],
    });
    expect(identity).not.toHaveProperty('type');
  });

  it('shares cache entries and eviction between implicit and explicit token subjects', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('tok_implicit_cached'))
      .mockResolvedValueOnce(tokenResponse('tok_refetched_explicit'))
      .mockResolvedValueOnce(tokenResponse('tok_refetched_implicit'));
    const implicit = {
      subject: { token: 'cache_alias.jwt', email: 'user@example.com' },
    };
    const explicit = {
      subject: { token: 'cache_alias.jwt', type: 'token' as const },
    };

    await getTokenResponse(CONNECTOR, implicit);
    await expect(getTokenResponse(CONNECTOR, explicit)).resolves.toMatchObject({
      token: 'tok_implicit_cached',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    deleteTokenCacheEntry(CONNECTOR, explicit);
    await expect(getTokenResponse(CONNECTOR, implicit)).resolves.toMatchObject({
      token: 'tok_refetched_explicit',
    });

    deleteTokenCacheEntry(CONNECTOR, implicit);
    await expect(getTokenResponse(CONNECTOR, explicit)).resolves.toMatchObject({
      token: 'tok_refetched_implicit',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps different implicit subject tokens in separate cache entries', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('first_access_token'))
      .mockResolvedValueOnce(tokenResponse('second_access_token'));

    await expect(
      getToken(CONNECTOR, { subject: { token: 'first_identity.jwt' } })
    ).resolves.toBe('first_access_token');
    await expect(
      getToken(CONNECTOR, { subject: { token: 'second_identity.jwt' } })
    ).resolves.toBe('second_access_token');
    await expect(
      getToken(CONNECTOR, { subject: { token: 'first_identity.jwt' } })
    ).resolves.toBe('first_access_token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { type: 'app' },
    { type: 'user', id: 'explicit_user' },
    { type: 'jwt-bearer', sub: 'explicit_jwt_user' },
  ] as const)('preserves an explicit non-token subject type: %j', async value => {
    fetchMock.mockResolvedValue(tokenResponse(`tok_${value.type}`));
    const subject = { ...value, token: 'unused.jwt' };

    await getTokenResponse(CONNECTOR, { subject });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      subject,
      scopes: ['*'],
    });
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
