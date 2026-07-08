import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectGitHubAdapter,
  connectLinearAdapter,
  connectSlackAdapter,
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
    expect(JSON.parse(init.body as string)).toEqual(body);
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

function jsonTokenResponse(token: string): Response {
  return new Response(
    JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: { id: 'scl_abc', uid: 'oauth/test', type: 'oauth' },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
