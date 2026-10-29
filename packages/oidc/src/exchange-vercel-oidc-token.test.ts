import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
  } as unknown as Response;
}

function futureExpiry(secondsFromNow = 3600): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

describe('exchangeVercelOidcToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset modules so the module-level cache starts empty for each test.
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function loadExchange() {
    const mod = await import('./exchange-vercel-oidc-token');
    return mod.exchangeVercelOidcToken;
  }

  it('reuses the cached token when the API returns an expiry', async () => {
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'exchanged', expiry: futureExpiry() })
    );

    const first = await exchange({
      token: 't',
      audience: 'https://a.example.com',
    });
    const second = await exchange({
      token: 't',
      audience: 'https://a.example.com',
    });

    expect(first).toBe('exchanged');
    expect(second).toBe('exchanged');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache when the API omits the expiry', async () => {
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(jsonResponse({ token: 'exchanged' }));

    await exchange({ token: 't', audience: 'https://a.example.com' });
    await exchange({ token: 't', audience: 'https://a.example.com' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skipCache bypasses the cache but still refreshes it', async () => {
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'exchanged', expiry: futureExpiry() })
    );

    await exchange({ token: 't', audience: 'https://a.example.com' });
    await exchange({
      token: 't',
      audience: 'https://a.example.com',
      skipCache: true,
    });
    await exchange({ token: 't', audience: 'https://a.example.com' });

    // Call 1 populates, call 2 bypasses + refreshes, call 3 hits the cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-exchanges once the cached token has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'exchanged', expiry: futureExpiry(60) })
    );

    await exchange({ token: 't', audience: 'https://a.example.com' });
    vi.advanceTimersByTime(61_000);
    await exchange({ token: 't', audience: 'https://a.example.com' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by token, audience, and jti', async () => {
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'exchanged', expiry: futureExpiry() })
    );

    await exchange({ token: 't', audience: 'https://a.example.com' });
    await exchange({ token: 't', audience: 'https://b.example.com' });
    await exchange({ token: 't', audience: 'https://a.example.com', jti: 'x' });
    await exchange({ token: 'u', audience: 'https://a.example.com' });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('evicts the least-recently-used entry beyond the size limit', async () => {
    const exchange = await loadExchange();
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'exchanged', expiry: futureExpiry() })
    );

    // Fill one entry past the 1000-entry limit, evicting the oldest (token-0).
    for (let i = 0; i <= 1000; i++) {
      await exchange({
        token: `token-${i}`,
        audience: 'https://a.example.com',
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1001);

    // token-0 was evicted, so this misses and re-fetches.
    await exchange({ token: 'token-0', audience: 'https://a.example.com' });
    expect(fetchMock).toHaveBeenCalledTimes(1002);

    // token-1000 is still the most-recent entry, so this hits the cache.
    await exchange({ token: 'token-1000', audience: 'https://a.example.com' });
    expect(fetchMock).toHaveBeenCalledTimes(1002);
  });
  it('exchanges AWS identity through the dedicated endpoint with bounded requests', async () => {
    const { exchangeVercelAwsOidcToken } = await import(
      './exchange-vercel-oidc-token'
    );
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'aws-token', expiry: futureExpiry(300) })
    );
    expect(await exchangeVercelAwsOidcToken({ token: 'source' })).toBe(
      'aws-token'
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oidc.vercel.com/~aws-token');
    expect(JSON.parse(init.body)).toEqual({ token: 'source' });
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('separates AWS tokens from standard exchanges and supports cache bypass', async () => {
    const { exchangeVercelAwsOidcToken, exchangeVercelOidcToken } =
      await import('./exchange-vercel-oidc-token');
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ token: 'standard', expiry: futureExpiry(300) })
      )
      .mockResolvedValueOnce(
        jsonResponse({ token: 'aws', expiry: futureExpiry(300) })
      )
      .mockResolvedValueOnce(
        jsonResponse({ token: 'fresh-aws', expiry: futureExpiry(300) })
      );
    expect(await exchangeVercelOidcToken({ token: 'source' })).toBe('standard');
    expect(await exchangeVercelAwsOidcToken({ token: 'source' })).toBe('aws');
    expect(await exchangeVercelAwsOidcToken({ token: 'source' })).toBe('aws');
    expect(
      await exchangeVercelAwsOidcToken({ token: 'source', skipCache: true })
    ).toBe('fresh-aws');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { token: '', expiry: 9999999999 },
    { token: 'aws' },
    { token: 'aws', expiry: 0 },
    { token: 'aws', expiry: Number.NaN },
    { token: 'aws', expiry: Number.POSITIVE_INFINITY },
  ])('rejects invalid AWS exchange responses %j', async body => {
    const { exchangeVercelAwsOidcToken } = await import(
      './exchange-vercel-oidc-token'
    );
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(
      exchangeVercelAwsOidcToken({ token: 'source' })
    ).rejects.toThrow('Failed to exchange token');
  });

  it('propagates AWS exchange denial and does not cache it', async () => {
    const { exchangeVercelAwsOidcToken } = await import(
      './exchange-vercel-oidc-token'
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Not authorized' }, false))
      .mockResolvedValueOnce(
        jsonResponse({ token: 'aws', expiry: futureExpiry(300) })
      );
    await expect(
      exchangeVercelAwsOidcToken({ token: 'source' })
    ).rejects.toThrow('Not authorized');
    expect(await exchangeVercelAwsOidcToken({ token: 'source' })).toBe('aws');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
