import { beforeEach, describe, expect, it, vi } from 'vitest';
import login from '../../../../src/commands/login';
import { client } from '../../../mocks/client';
import * as oauth from '../../../../src/util/oauth';
import { randomUUID } from 'node:crypto';

const fetchSpy = vi.spyOn(globalThis, 'fetch');

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    clone: () => ({ text: async () => 'called in debug output' }),
    json: async () => data,
  } as unknown as Response;
}

function simulateTokenPolling(pollCount: number, finalResponse: Response) {
  for (let i = 0; i < pollCount; i++) {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({ error: 'authorization_pending' }, false)
    );
  }
  fetchSpy.mockResolvedValueOnce(finalResponse);
  return finalResponse.json();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('login', () => {
  it('successful login', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse({
        issuer: 'https://vercel.com',
        device_authorization_endpoint: 'https://vercel.com',
        token_endpoint: 'https://vercel.com',
        revocation_endpoint: 'https://vercel.com',
        jwks_uri: 'https://vercel.com',
        introspection_endpoint: 'https://vercel.com',
      })
    );
    const _as = await oauth.as();

    const authorizationResult = {
      device_code: randomUUID(),
      user_code: randomUUID(),
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete: `https://vercel.com/device?code=${randomUUID()}`,
      expires_in: 30,
      interval: 0.005,
    };

    fetchSpy.mockResolvedValueOnce(mockResponse(authorizationResult));

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

    expect(fetchSpy).toHaveBeenCalledTimes(pollCount + 4);

    expect(fetchSpy).toHaveBeenNthCalledWith(
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
      new Headers(fetchSpy.mock.calls[0][1]?.headers as HeadersInit).get('user-agent'),
      'Passing the correct user agent so the user can verify'
    ).toBe(oauth.userAgent);

    expect(
      (fetchSpy.mock.calls[1][1] as RequestInit)?.body?.toString(),
      'Requesting a device code with the correct params'
    ).toBe(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        scope: tokenResult.scope,
      }).toString()
    );

    expect(
      (fetchSpy.mock.calls[pollCount + 1][1] as RequestInit)?.body?.toString(),
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
