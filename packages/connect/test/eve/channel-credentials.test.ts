import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectGitHubCredentials,
  connectLinearCredentials,
  connectSlackCredentials,
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

  it('keeps Slack credentials backed by an app-scoped Connect token', async () => {
    fetchMock.mockResolvedValue(jsonTokenResponse('slack_token'));

    const credentials = connectSlackCredentials(
      'oauth/slack',
      { installationId: 'slack-installation' },
      { vercelToken: 'vercel_token' }
    );

    expect(credentials.webhookVerifier).toEqual(expect.any(Function));
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
    expect(JSON.parse(init.body as string)).toEqual(body);
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
