globalThis.fetch = vi.fn();
import { beforeEach, describe, expect, it } from 'vitest';
import login from '../../../../src/commands/login';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import _fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import * as oauth from '../../../../src/util/oauth';

vi.mock('node-fetch', async () => ({
  ...(await vi.importActual('node-fetch')),
  default: vi.fn(),
}));
const nodeFetch = vi.mocked(_fetch);
const fetch = vi.mocked(globalThis.fetch);

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    clone: () => ({ text: async () => 'called in debug output' }),
    json: async () => data,
  } as unknown as Response;
}

function simulateTokenPolling(pollCount: number, finalResponse: Response) {
  for (let i = 0; i < pollCount; i++) {
    fetch.mockResolvedValueOnce(
      mockResponse({ error: 'authorization_pending' }, false)
    );
  }
  fetch.mockResolvedValueOnce(finalResponse);
  return finalResponse.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  }>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('login', () => {
  it('successful login', async () => {
    const _as = {
      issuer: 'https://vercel.com',
      device_authorization_endpoint: 'https://vercel.com',
      token_endpoint: 'https://vercel.com',
      revocation_endpoint: 'https://vercel.com',
      jwks_uri: 'https://vercel.com',
      introspection_endpoint: 'https://vercel.com',
    };
    fetch.mockResolvedValueOnce(mockResponse(_as));

    const authorizationResult = {
      device_code: randomUUID(),
      user_code: randomUUID(),
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete: `https://vercel.com/device?code=${randomUUID()}`,
      expires_in: 30,
      interval: 0.005,
    };

    fetch.mockResolvedValueOnce(mockResponse(authorizationResult));

    const pollCount = 2;
    const tokenResult = await simulateTokenPolling(
      pollCount,
      mockResponse({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 1,
        scope: 'openid offline_access',
      })
    );

    client.setArgv('login');
    delete client.authConfig.token;
    const teamBefore = client.config.currentTeam;
    expect(teamBefore).toBeUndefined();
    const tokenBefore = client.authConfig.token;

    const exitCodePromise = login(client, { shouldParseArgs: true });
    expect(await exitCodePromise, 'exit code for "login"').toBe(0);
    await expect(client.stderr).toOutput('Congratulations!');

    // Some calls come from `client.fetch`, which uses `node-fetch` under the hood,
    // so we need to account for both here.
    expect(fetch.mock.calls.length + nodeFetch.mock.calls.length).toBe(
      pollCount + 4
    );

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      _as.device_authorization_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': expect.any(String),
        },
        body: expect.any(URLSearchParams),
      })
    );

    expect(
      // TODO: Drop `Headers` wrapper when `node-fetch` is dropped
      new Headers(fetch.mock.calls[0][1]?.headers).get('user-agent'),
      'Passing the correct user agent so the user can verify'
    ).toBe(oauth.userAgent);

    expect(
      fetch.mock.calls[1][1]?.body?.toString(),
      'Requesting a device code with the correct params'
    ).toBe(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        scope: tokenResult.scope,
      }).toString()
    );

    expect(
      fetch.mock.calls[pollCount + 1][1]?.body?.toString(),
      'Polling with the received device code'
    ).toBe(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: authorizationResult.device_code,
      }).toString()
    );

    const tokenAfter = client.authConfig.token;
    expect(tokenAfter, 'Token differs from original').not.toBe(tokenBefore);
    expect(tokenAfter).toBe(tokenResult.access_token);
  });

  it.todo('Authorization request error');
  it.todo('Token request error');
});
