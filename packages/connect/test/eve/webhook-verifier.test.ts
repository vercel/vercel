import { verifyVercelOidcToken } from '@vercel/oidc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectDiscordCredentials,
  connectGitHubCredentials,
  connectLinearCredentials,
  connectLinqCredentials,
  connectSendblueCredentials,
  connectSlackCredentials,
  connectTeamsCredentials,
} from '../../src/eve/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  verifyVercelOidcToken: vi.fn(),
}));

type Verifier = (request: Request, body: string) => unknown;

const helpers: Array<[string, () => { webhookVerifier?: unknown }]> = [
  ['Discord', () => connectDiscordCredentials('discord/bot')],
  ['GitHub', () => connectGitHubCredentials('github/app')],
  ['Linear', () => connectLinearCredentials('linear/app')],
  ['Linq', () => connectLinqCredentials('linq/agent')],
  ['Microsoft Teams', () => connectTeamsCredentials('microsoft-teams/bot')],
  ['Sendblue', () => connectSendblueCredentials('sendblue/agent')],
  ['Slack', () => connectSlackCredentials('slack/bot')],
];

function forwardedWebhook(): Request {
  return new Request('https://agent.example/webhook', {
    method: 'POST',
    headers: { authorization: 'Bearer forwarded_token' },
  });
}

describe('Eve channel credential webhook verification', () => {
  beforeEach(() => {
    vi.mocked(verifyVercelOidcToken).mockReset();
  });

  it.each(
    helpers
  )('%s pins forwarded tokens to the deployment project and environment', async (_name, build) => {
    vi.mocked(verifyVercelOidcToken).mockResolvedValue({
      payload: { aud: 'https://vercel.com/acme' },
    } as Awaited<ReturnType<typeof verifyVercelOidcToken>>);
    const verify = build().webhookVerifier as Verifier;

    await expect(verify(forwardedWebhook(), '{}')).resolves.toBe(true);
    // No options: verifyVercelOidcToken defaults to VERCEL_PROJECT_ID and
    // VERCEL_TARGET_ENV / VERCEL_ENV, so other environments are rejected.
    expect(verifyVercelOidcToken).toHaveBeenCalledWith(
      'forwarded_token',
      undefined
    );
  });

  it.each(
    helpers
  )('%s rejects a token re-minted by the audience exchange', async (_name, build) => {
    vi.mocked(verifyVercelOidcToken).mockResolvedValue({
      payload: {
        aud: 'https://partner.example',
        act: { aud: 'https://vercel.com/acme' },
      },
    } as unknown as Awaited<ReturnType<typeof verifyVercelOidcToken>>);
    const verify = build().webhookVerifier as Verifier;

    await expect(verify(forwardedWebhook(), '{}')).rejects.toThrow(
      'Exchanged OIDC tokens are not accepted'
    );
  });
});
