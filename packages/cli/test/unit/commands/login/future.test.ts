import { beforeEach, describe, expect, it } from 'vitest';
import { login } from '../../../../src/commands/login/future';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import _fetch, { Headers, type Response } from 'node-fetch';
import * as oauth from '../../../../src/util/oauth';
import { randomUUID } from 'node:crypto';

const inspectToken = vi.mocked(oauth.inspectToken);
vi.mock('../../../../src/util/oauth', async () => ({
  ...(await vi.importActual('../../../../src/util/oauth')),
  inspectToken: vi.fn(),
}));

const fetch = vi.mocked(_fetch);
vi.mock('node-fetch', async () => ({
  ...(await vi.importActual('node-fetch')),
  default: vi.fn(),
}));

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
  return finalResponse.json();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('login --future', () => {
  it('successful login', async () => {
    fetch.mockResolvedValueOnce(
      mockResponse({
        issuer: 'https://vercel.com',
        device_authorization_endpoint: 'https://vercel.com',
        token_endpoint: 'https://vercel.com',
        revocation_endpoint: 'https://vercel.com',
        jwks_uri: 'https://vercel.com',
      })
    );
    const _as = await oauth.as();
    const accessTokenPayload = {
      active: true,
      team_id: randomUUID(),
      token_type: 'access_token',
      exp: Number.POSITIVE_INFINITY,
    } as const;

    inspectToken.mockReturnValueOnce([null, accessTokenPayload]);

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

    client.setArgv('login', '--future');
    delete client.authConfig.token;
    const teamBefore = client.config.currentTeam;
    expect(teamBefore).toBeUndefined();
    const tokenBefore = client.authConfig.token;

    const exitCodePromise = login(client);
    expect(await exitCodePromise, 'exit code for "login --future"').toBe(0);
    await expect(client.stderr).toOutput('Congratulations!');

    expect(fetch).toHaveBeenCalledTimes(pollCount + 3);

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

    for (let i = 3; i <= fetch.mock.calls.length; i++) {
      expect(fetch).toHaveBeenNthCalledWith(
        i,
        _as.token_endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'user-agent': oauth.userAgent,
          },
          body: expect.any(URLSearchParams),
        })
      );
    }

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

    const teamAfter = client.config.currentTeam;
    expect(teamAfter, 'Team id differs from original').not.toBe(teamBefore);
    expect(teamAfter).toBe(accessTokenPayload.team_id);

    const tokenAfter = client.authConfig.token;
    expect(tokenAfter, 'Token differs from original').not.toBe(tokenBefore);
    expect(tokenAfter).toBe(tokenResult.access_token);
  });

  it.todo('Authorization request error');
  it.todo('Token request error');
});
