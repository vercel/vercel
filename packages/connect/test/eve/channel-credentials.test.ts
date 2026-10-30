import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectDiscordCredentials,
  connectGitHubCredentials,
  connectLinearCredentials,
  connectLinqCredentials,
  connectPhotonCredentials,
  connectTeamsCredentials,
  connectSlackCredentials,
  connectSendblueCredentials,
  connectTelegramCredentials,
  connectTwilioCredentials,
} from '../../src/eve/index.js';

describe('Eve channel credential helpers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['slack', connectSlackCredentials],
    ['github', connectGitHubCredentials],
    ['linear', connectLinearCredentials],
    ['discord', connectDiscordCredentials],
    ['linq', connectLinqCredentials],
    ['photon', connectPhotonCredentials],
    ['microsoft-teams', connectTeamsCredentials],
    ['sendblue', connectSendblueCredentials],
  ] as const)('declares %s without resolving runtime credentials', (service, create) => {
    const credentials = create(`${service}/agent`);
    expect(credentials.vercelConnect).toEqual({
      connector: `${service}/agent`,
      requirement: {
        reference: `connector:${service}/agent`,
        service,
        method: service,
        subjectTypes: ['app'],
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'telegram',
    'twilio',
  ] as const)('resolves %s API-key credentials lazily with an app subject', async service => {
    fetchMock.mockResolvedValue(jsonTokenResponse('provider-token'));
    const options = { vercelToken: 'vercel_token' };
    const credentials =
      service === 'telegram'
        ? connectTelegramCredentials('telegram/agent', {}, options)
        : connectTwilioCredentials('twilio/agent', 'AC123', {}, options);
    expect(credentials.vercelConnect.requirement).toMatchObject({
      reference: `connector:${service}/agent`,
      service,
      method: 'api-key',
      subjectTypes: ['app'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const token =
      'botToken' in credentials ? credentials.botToken : credentials.authToken;
    await expect(token()).resolves.toBe('provider-token');
    expectTokenRequest(`${service}/agent`, { subject: { type: 'app' } });
    if ('accountSid' in credentials)
      expect(credentials.accountSid).toBe('AC123');
  });

  it('builds Discord credentials backed by one app-scoped Connect token response', async () => {
    fetchMock.mockResolvedValue(
      jsonTokenResponse('discord_token', {
        metadata: { applicationId: '123456789' },
      })
    );

    const credentials = connectDiscordCredentials(
      'discord/my-bot',
      {},
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    const [botToken, applicationId] = await Promise.all([
      resolveToken(credentials.botToken),
      resolveToken(credentials.applicationId),
    ]);
    expect(botToken).toBe('discord_token');
    expect(applicationId).toBe('123456789');
    expectTokenRequest('discord/my-bot', { subject: { type: 'app' } });
  });

  it('retries Discord credential resolution after a failed shared request', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        jsonTokenResponse('discord_token', {
          metadata: { applicationId: '123456789' },
        })
      );

    const credentials = connectDiscordCredentials(
      'discord/retry',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(credentials.botToken)).rejects.toThrow(
      'temporary failure'
    );
    await expect(resolveToken(credentials.applicationId)).resolves.toBe(
      '123456789'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when Discord application metadata is unavailable', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('discord_token'));

    const credentials = connectDiscordCredentials(
      'discord/missing-metadata',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(credentials.applicationId)).rejects.toThrow(
      'did not return a Discord application id'
    );
  });

  it('builds GitHub credentials backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('github_token'));

    const credentials = connectGitHubCredentials(
      'oauth/github',
      { installationId: 'github-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    expect(credentials.installationToken).toEqual(expect.any(Function));
    await expect(resolveToken(credentials.installationToken)).resolves.toBe(
      'github_token'
    );
    expectTokenRequest('oauth/github', {
      installationId: 'github-installation',
      subject: { type: 'app' },
    });
  });

  it('resolves the GitHub App slug from connector metadata', async () => {
    fetchMock.mockResolvedValue(
      jsonConnectorResponse('oauth/github', { appSlug: 'my-agent' })
    );

    const credentials = connectGitHubCredentials(
      'oauth/github',
      {},
      { vercelToken: 'vercel_token' }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(resolveToken(credentials.appSlug)).resolves.toBe('my-agent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.vercel.com/v1/connect/connectors/${encodeURIComponent('oauth/github')}`
    );
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer vercel_token',
    });
  });

  it('fails clearly when connector metadata has no GitHub App slug', async () => {
    fetchMock.mockResolvedValue(jsonConnectorResponse('oauth/github', {}));

    const credentials = connectGitHubCredentials(
      'oauth/github',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(credentials.appSlug)).rejects.toThrow(
      'did not return a GitHub App slug'
    );
  });

  it('builds Linear credentials backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('linear_token'));

    const credentials = connectLinearCredentials(
      'oauth/linear',
      { installationId: 'linear-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    expect(credentials.accessToken).toEqual(expect.any(Function));
    await expect(resolveToken(credentials.accessToken)).resolves.toBe(
      'linear_token'
    );
    expectTokenRequest('oauth/linear', {
      installationId: 'linear-installation',
      subject: { type: 'app' },
    });
  });

  it('resolves Linq credentials from an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('linq-api-key'));

    const credentials = connectLinqCredentials(
      'linq/my-agent',
      {},
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(credentials.apiKey()).resolves.toBe('linq-api-key');
    expectTokenRequest('linq/my-agent', { subject: { type: 'app' } });
  });

  it('builds Teams credentials from connector metadata and a Bot Framework token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonConnectorResponse('microsoft-teams/my-bot', {
          appId: 'teams-app-id',
        })
      )
      .mockResolvedValueOnce(jsonTokenResponse('bot-framework-token'));

    const credentials = connectTeamsCredentials(
      'microsoft-teams/my-bot',
      { installationId: 'teams-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    expect(credentials.tokenProvider).toEqual(expect.any(Function));
    await expect(resolveToken(credentials.appId)).resolves.toBe('teams-app-id');
    await expect(credentials.tokenProvider!()).resolves.toEqual({
      accessToken: 'bot-framework-token',
      expiresAt: expect.any(Number),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [metadataUrl, metadataInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(metadataUrl).toBe(
      `https://api.vercel.com/v1/connect/connectors/${encodeURIComponent('microsoft-teams/my-bot')}`
    );
    expect(metadataInit.headers).toMatchObject({
      Authorization: 'Bearer vercel_token',
    });
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(tokenUrl).toBe(
      `https://api.vercel.com/v1/connect/token/${encodeURIComponent('microsoft-teams/my-bot')}`
    );
    expect(JSON.parse(tokenInit.body as string)).toEqual({
      installationId: 'teams-installation',
      scopes: ['https://api.botframework.com/.default'],
      subject: { type: 'app' },
    });
  });

  it('fails clearly when connector metadata has no Microsoft Teams app id', async () => {
    fetchMock.mockResolvedValue(
      jsonConnectorResponse('microsoft-teams/missing-app-id', {})
    );

    const credentials = connectTeamsCredentials(
      'microsoft-teams/missing-app-id',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(credentials.appId)).rejects.toThrow(
      'did not return a Microsoft Teams app id'
    );
  });

  it('resolves Photon credentials from an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(
      jsonTokenResponse('photon-secret', {
        metadata: { projectId: 'photon-project' },
      })
    );

    const credentials = connectPhotonCredentials(
      'photon/my-project',
      {},
      { vercelToken: 'vercel_token' }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(credentials()).resolves.toEqual({
      projectId: 'photon-project',
      projectSecret: 'photon-secret',
    });
    expectTokenRequest('photon/my-project', {
      subject: { type: 'app' },
    });
  });

  it.each([
    undefined,
    {},
    { projectId: '' },
    { projectId: 123 },
  ])('rejects malformed Photon metadata: %j', async metadata => {
    fetchMock.mockResolvedValue(
      jsonTokenResponse('photon-secret', { metadata })
    );

    const credentials = connectPhotonCredentials(
      'photon/my-project',
      {},
      {
        vercelToken: 'vercel_token',
        forceRefresh: true,
      }
    );

    await expect(credentials()).rejects.toThrow(
      'Photon connector returned invalid credentials.'
    );
  });

  it('keeps Slack credentials backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('slack_token'));

    const credentials = connectSlackCredentials(
      'oauth/slack',
      { installationId: 'slack-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
    expect(credentials.vercelConnect).toEqual({
      connector: 'oauth/slack',
      requirement: {
        reference: 'connector:oauth/slack',
        service: 'slack',
        subjectTypes: ['app'],
        method: 'slack',
      },
    });
    expect(credentials.botToken).toEqual(expect.any(Function));
    await expect(resolveToken(credentials.botToken)).resolves.toBe(
      'slack_token'
    );
    expectTokenRequest('oauth/slack', {
      installationId: 'slack-installation',
      subject: { type: 'app' },
    });
  });

  function expectTokenRequest(
    connector: string,
    body: Record<string, unknown>
  ): void {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.vercel.com/v1/connect/token/${encodeURIComponent(connector)}`
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer vercel_token',
    });
    expect(JSON.parse(init.body as string)).toEqual(
      body.scopes === undefined ? { ...body, scopes: ['*'] } : body
    );
  }
});

async function resolveToken(
  token: string | (() => string | Promise<string>) | undefined
): Promise<string> {
  if (typeof token !== 'function') {
    throw new Error('Expected token callback.');
  }
  return token();
}

function jsonConnectorResponse(
  uid: string,
  vendor: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      id: 'scl_abc',
      uid,
      name: 'Test Connector',
      type: 'oauth',
      service: 'github',
      createdAt: 0,
      updatedAt: 0,
      data: vendor,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function jsonTokenResponse(
  token: string,
  overrides: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: { id: 'scl_abc', uid: 'oauth/test', type: 'oauth' },
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
