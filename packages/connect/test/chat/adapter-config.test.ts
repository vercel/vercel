import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectDiscordAdapter,
  connectGitHubAdapter,
  connectLinearAdapter,
  connectLinqAdapter,
  connectNotionAdapter,
  connectSendblueAdapter,
  connectSlackAdapter,
  connectTelegramAdapter,
} from '../../src/chat/index.js';

describe('Chat SDK adapter config helpers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds Discord config from one app-scoped Connect token response', async () => {
    fetchMock.mockResolvedValue(
      jsonTokenResponse('discord_token', {
        metadata: { applicationId: '123456789' },
      })
    );

    const config = connectDiscordAdapter(
      'discord/acme-discord',
      { installationId: 'discord-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    const [botToken, applicationId] = await Promise.all([
      resolveToken(config.botToken),
      resolveToken(config.applicationId),
    ]);
    expect(botToken).toBe('discord_token');
    expect(applicationId).toBe('123456789');
    expectTokenRequest('discord/acme-discord', {
      installationId: 'discord-installation',
      subject: { type: 'app' },
    });
  });

  it('retries Discord config resolution after a failed shared request', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        jsonTokenResponse('discord_token', {
          metadata: { applicationId: '123456789' },
        })
      );

    const config = connectDiscordAdapter(
      'discord/retry',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(config.botToken)).rejects.toThrow(
      'temporary failure'
    );
    await expect(resolveToken(config.applicationId)).resolves.toBe('123456789');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when Discord application metadata is unavailable', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('discord_token'));

    const config = connectDiscordAdapter(
      'discord/missing-metadata',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(config.applicationId)).rejects.toThrow(
      'did not return a Discord application id'
    );
  });

  it('builds token-only Notion config with app-scoped parameters', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('notion_token'));

    const config = connectNotionAdapter(
      'notion/acme-notion',
      {
        installationId: 'notion-installation',
        scopes: ['read'],
        validityBufferMs: 60_000,
      },
      { vercelToken: 'vercel_token' }
    );

    expect(config.token).toEqual(expect.any(Function));
    expect(config).not.toHaveProperty('webhookVerifier');
    await expect(resolveToken(config.token)).resolves.toBe('notion_token');
    expectTokenRequest('notion/acme-notion', {
      installationId: 'notion-installation',
      scopes: ['read'],
      validityBufferMs: 60_000,
      subject: { type: 'app' },
    });
  });

  it('defaults Notion params to the app subject', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('notion_token'));

    const config = connectNotionAdapter('notion/acme-notion', undefined, {
      vercelToken: 'vercel_token',
    });

    await resolveToken(config.token);
    expectTokenRequest('notion/acme-notion', { subject: { type: 'app' } });
  });

  it('builds token-only Telegram config with app-scoped parameters', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('telegram_token'));

    const config = connectTelegramAdapter(
      'telegram/acme-telegram',
      {
        installationId: 'telegram-installation',
        scopes: ['read'],
        validityBufferMs: 60_000,
      },
      { vercelToken: 'vercel_token' }
    );

    expect(config.botToken).toEqual(expect.any(Function));
    expect(config).not.toHaveProperty('webhookVerifier');
    await expect(resolveToken(config.botToken)).resolves.toBe('telegram_token');
    expectTokenRequest('telegram/acme-telegram', {
      installationId: 'telegram-installation',
      scopes: ['read'],
      validityBufferMs: 60_000,
      subject: { type: 'app' },
    });
  });

  it('defaults Telegram params to the app subject', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('telegram_token'));

    const config = connectTelegramAdapter('telegram/acme-telegram', undefined, {
      vercelToken: 'vercel_token',
    });

    await resolveToken(config.botToken);
    expectTokenRequest('telegram/acme-telegram', { subject: { type: 'app' } });
  });

  it('builds Sendblue config from an app-scoped Connect token response', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonTokenResponse('sendblue-access-token'))
      .mockResolvedValueOnce(
        jsonConnectorMetadata({
          lines: [{ phone_number: '+14155551234' }],
        })
      );

    const config = connectSendblueAdapter(
      'sendblue/acme-agent',
      { installationId: 'sendblue-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    expect(config.accessToken).toEqual(expect.any(Function));
    await expect(resolveToken(config.accessToken)).resolves.toBe(
      'sendblue-access-token'
    );
    await expect(resolveToken(config.defaultFromNumber)).resolves.toBe(
      '+14155551234'
    );
    await expect(
      resolveAllowedFromNumbers(config.allowedFromNumbers)
    ).resolves.toEqual(['+14155551234']);
    expectTokenRequest(
      'sendblue/acme-agent',
      {
        installationId: 'sendblue-installation',
        subject: { type: 'app' },
      },
      0
    );
  });

  it('allows every managed Sendblue line while requiring an explicit default for multiple lines', async () => {
    fetchMock.mockResolvedValue(
      jsonConnectorMetadata({
        lines: [
          { phone_number: '+14155551234' },
          { phone_number: '+14155559876' },
        ],
      })
    );

    const config = connectSendblueAdapter(
      'sendblue/acme-agent',
      {},
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(config.defaultFromNumber)).rejects.toThrow(
      'multiple Sendblue lines'
    );
    await expect(
      resolveAllowedFromNumbers(config.allowedFromNumbers)
    ).resolves.toEqual(['+14155551234', '+14155559876']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates a lazy Sendblue line selection against connector metadata', async () => {
    fetchMock.mockResolvedValue(
      jsonConnectorMetadata({
        lines: [{ phone_number: '+14155551234' }],
      })
    );
    const fromNumber = vi.fn().mockResolvedValue('+14155551234');
    const config = connectSendblueAdapter(
      'sendblue/acme-agent',
      { fromNumber },
      { vercelToken: 'vercel_token' }
    );

    await expect(resolveToken(config.defaultFromNumber)).resolves.toBe(
      '+14155551234'
    );
    expect(fromNumber).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('builds Slack config backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('slack_token'));

    const config = connectSlackAdapter(
      'slack/acme-slack',
      { installationId: 'slack-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    expect(config.botToken).toEqual(expect.any(Function));
    await expect(resolveToken(config.botToken)).resolves.toBe('slack_token');
    expectTokenRequest('slack/acme-slack', {
      installationId: 'slack-installation',
      subject: { type: 'app' },
    });
  });

  it('builds GitHub config backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('github_token'));

    const config = connectGitHubAdapter(
      'github/acme-github',
      { installationId: 'github-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    expect(config.installationToken).toEqual(expect.any(Function));
    await expect(resolveToken(config.installationToken)).resolves.toBe(
      'github_token'
    );
    expectTokenRequest('github/acme-github', {
      installationId: 'github-installation',
      subject: { type: 'app' },
    });
  });

  it('builds Linear config backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('linear_token'));

    const config = connectLinearAdapter(
      'linear/acme-linear',
      { installationId: 'linear-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    expect(config.accessToken).toEqual(expect.any(Function));
    await expect(resolveToken(config.accessToken)).resolves.toBe(
      'linear_token'
    );
    expectTokenRequest('linear/acme-linear', {
      installationId: 'linear-installation',
      subject: { type: 'app' },
    });
  });

  it('builds Linq config backed by app-scoped Connect credentials', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('linq-api-key'));

    const config = connectLinqAdapter(
      'linq/my-agent',
      { installationId: 'linq-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(config.webhookVerifier).toEqual(expect.any(Function));
    await expect(config.credentials()).resolves.toEqual({
      apiKey: 'linq-api-key',
    });
    expectTokenRequest('linq/my-agent', {
      installationId: 'linq-installation',
      subject: { type: 'app' },
    });
  });

  it('pins the subject to app even when params are omitted', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('slack_token'));

    const config = connectSlackAdapter('slack/acme-slack', undefined, {
      vercelToken: 'vercel_token',
    });

    await resolveToken(config.botToken);
    expectTokenRequest('slack/acme-slack', { subject: { type: 'app' } });
  });

  it('defaults GitHub params to app subject when omitted', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('github_token'));

    const config = connectGitHubAdapter('github/acme-github', undefined, {
      vercelToken: 'vercel_token',
    });

    await resolveToken(config.installationToken);
    expectTokenRequest('github/acme-github', { subject: { type: 'app' } });
  });

  it('defaults Linear params to app subject when omitted', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('linear_token'));

    const config = connectLinearAdapter('linear/acme-linear', undefined, {
      vercelToken: 'vercel_token',
    });

    await resolveToken(config.accessToken);
    expectTokenRequest('linear/acme-linear', { subject: { type: 'app' } });
  });

  it('builds GitHub and Linear configs with no params or options at all', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('token'));

    const github = connectGitHubAdapter('github/acme-github');
    expect(github.webhookVerifier).toEqual(expect.any(Function));
    expect(github.installationToken).toEqual(expect.any(Function));

    const linear = connectLinearAdapter('linear/acme-linear');
    expect(linear.webhookVerifier).toEqual(expect.any(Function));
    expect(linear.accessToken).toEqual(expect.any(Function));
  });

  it('forwards scopes and validityBufferMs through to getToken', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('slack_token'));

    const config = connectSlackAdapter(
      'slack/acme-slack',
      { scopes: ['chat:write'], validityBufferMs: 60_000 },
      { vercelToken: 'vercel_token' }
    );

    await resolveToken(config.botToken);
    expectTokenRequest('slack/acme-slack', {
      scopes: ['chat:write'],
      validityBufferMs: 60_000,
      subject: { type: 'app' },
    });
  });

  function expectTokenRequest(
    connector: string,
    body: Record<string, unknown>,
    callIndex = 0
  ): void {
    const [url, init] = fetchMock.mock.calls[callIndex] as [
      string,
      RequestInit,
    ];
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
  token: (() => string | Promise<string>) | undefined
): Promise<string> {
  if (typeof token !== 'function') {
    throw new Error('Expected token callback.');
  }
  return token();
}

function jsonConnectorMetadata(data: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      id: 'scl_abc',
      uid: 'sendblue/acme-agent',
      name: 'Sendblue agent',
      type: 'sendblue',
      service: 'sendblue',
      createdAt: 0,
      updatedAt: 0,
      data,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

async function resolveAllowedFromNumbers(
  allowedFromNumbers: readonly string[] | (() => Promise<readonly string[]>)
): Promise<readonly string[]> {
  return typeof allowedFromNumbers === 'function'
    ? allowedFromNumbers()
    : allowedFromNumbers;
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
