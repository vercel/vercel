import { getVercelOidcToken, verifyVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectTeamsAdapter,
  type ConnectTeamsAdapterParams,
} from '../../src/chat/index.js';
import { deleteTokenCacheEntry } from '../../src/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn().mockResolvedValue('deployment-token'),
  verifyVercelOidcToken: vi.fn(),
}));

const connector = 'microsoft-teams/my-bot';
const botScope = 'https://api.botframework.com/.default';
const graphScope = 'https://graph.microsoft.com/.default';
const invalidAppIds = [undefined, '', 42, null];

describe('connectTeamsAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VERCEL_REGION', '');
    for (const scope of [botScope, graphScope]) {
      deleteTokenCacheEntry(connector, {
        subject: { type: 'app' },
        scopes: [scope],
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('lazily resolves the public app id using the supplied Connect options', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { appId: 'app-id' } }));
    const config = connectTeamsAdapter(
      connector,
      {},
      {
        vercelToken: 'explicit-token',
        region: 'sfo1',
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(config.appId()).resolves.toBe('app-id');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api-sfo1.vercel.com/v1/connect/connectors/${encodeURIComponent(connector)}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer explicit-token',
        }),
      })
    );
  });

  it.each(invalidAppIds)('rejects invalid app id %s', async appId => {
    fetchMock.mockResolvedValue(Response.json({ data: { appId } }));
    await expect(connectTeamsAdapter(connector).appId()).rejects.toThrow(
      `Vercel Connect connector ${connector} did not return a Microsoft Teams app id.`
    );
  });

  it('propagates metadata errors and retries resolution', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'forbidden', message: 'Connector not attached' } },
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(Response.json({ data: { appId: 'app-id' } }));
    const config = connectTeamsAdapter(connector);

    await expect(config.appId()).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
    await expect(config.appId()).resolves.toBe('app-id');
  });

  it('requests and caches Bot Framework and Graph tokens separately', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('bot-token'))
      .mockResolvedValueOnce(tokenResponse('graph-token'));
    const config = connectTeamsAdapter(connector);

    await expect(config.token(botScope, 'botframework.com')).resolves.toBe(
      'bot-token'
    );
    await expect(config.token([graphScope], 'common')).resolves.toBe(
      'graph-token'
    );
    await expect(config.token([botScope], 'another-tenant')).resolves.toBe(
      'bot-token'
    );
    await expect(config.token(graphScope)).resolves.toBe('graph-token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
    for (const [index, scope] of [botScope, graphScope].entries()) {
      const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(url).toBe(
        `https://api.vercel.com/v1/connect/token/${encodeURIComponent(connector)}`
      );
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer deployment-token',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        subject: { type: 'app' },
        scopes: [scope],
      });
    }
  });

  it('refreshes an expiring token without rebuilding the helper', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    fetchMock
      .mockResolvedValueOnce(tokenResponse('original', now + 60_000))
      .mockResolvedValueOnce(tokenResponse('refreshed', now + 120_000));
    const config = connectTeamsAdapter(connector);

    await expect(config.token(botScope)).resolves.toBe('original');
    clock.mockReturnValue(now + 31_000);
    await expect(config.token(botScope)).resolves.toBe('refreshed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forwards params and options but pins the subject and callback scopes', async () => {
    fetchMock.mockImplementation(() => tokenResponse('token'));
    const params = {
      installationId: 'team-installation',
      validityBufferMs: 60_000,
      audience: ['audience'],
      subject: { type: 'user', id: 'ignored' },
      scopes: ['ignored'],
    } as ConnectTeamsAdapterParams;
    const config = connectTeamsAdapter(connector, params, {
      vercelToken: 'explicit-token',
      region: 'sfo1',
      forceRefresh: true,
    });

    await config.token(graphScope, 'ignored-tenant');
    await config.token(graphScope);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api-sfo1.vercel.com/v1/connect/token/${encodeURIComponent(connector)}`
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer explicit-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      installationId: 'team-installation',
      validityBufferMs: 60_000,
      audience: ['audience'],
      subject: { type: 'app' },
      scopes: [graphScope],
    });
  });

  it('preserves Graph permission failures and allows a subsequent retry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 'microsoft_teams_installation_required',
              message: 'Add the bot to a team, then retry.',
            },
          },
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(tokenResponse('graph-token'));
    const config = connectTeamsAdapter(connector);

    await expect(config.token(graphScope)).rejects.toMatchObject({
      code: 'microsoft_teams_installation_required',
      status: 422,
      message: expect.stringContaining('Add the bot to a team'),
    });
    await expect(config.token(graphScope)).resolves.toBe('graph-token');
  });

  it('verifies forwarded activities and rejects invalid or missing OIDC tokens', async () => {
    const config = connectTeamsAdapter(connector);
    const request = new Request('https://example.com/api/webhooks/teams', {
      headers: { authorization: 'Bearer forwarded-token' },
    });
    vi.mocked(verifyVercelOidcToken).mockResolvedValueOnce({
      payload: { aud: 'https://vercel.com/acme' },
    } as Awaited<ReturnType<typeof verifyVercelOidcToken>>);
    await expect(config.webhookVerifier(request, '{}')).resolves.toBe(true);
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'forwarded-token',
      undefined
    );

    vi.mocked(verifyVercelOidcToken).mockRejectedValueOnce(
      new Error('invalid token')
    );
    await expect(config.webhookVerifier(request, '{}')).rejects.toThrow(
      'invalid token'
    );
    await expect(
      config.webhookVerifier(new Request(request.url), '{}')
    ).rejects.toThrow('Missing Authorization bearer token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function tokenResponse(
  token: string,
  expiresAt = Date.now() + 3_600_000
): Response {
  return Response.json({
    token,
    expiresAt,
    connector: { id: 'scl_teams', uid: connector, type: 'microsoft-teams' },
  });
}
