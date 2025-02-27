import { beforeEach, describe, expect, it, type MockInstance } from 'vitest';
import { login } from '../../../../src/commands/login/future';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import fetch, { Headers, type Response } from 'node-fetch';
import { as, VERCEL_CLI_CLIENT_ID } from '../../../../src/util/oauth';
import ua from '../../../../src/util/ua';
import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';

const fetchMock = fetch as unknown as MockInstance<typeof fetch>;
const jwtVerifyMock = jwtVerify as unknown as MockInstance<typeof jwtVerify>;

vi.mock('jose', async () => ({
  ...(await vi.importActual('jose')),
  jwtVerify: vi.fn(),
}));

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
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: 'authorization_pending' }, false)
    );
  }
  fetchMock.mockResolvedValueOnce(finalResponse);
  return finalResponse.json();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('login --future', () => {
  it('successful login', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        issuer: 'https://vercel.com',
        device_authorization_endpoint: 'https://vercel.com',
        token_endpoint: 'https://vercel.com',
        revocation_endpoint: 'https://vercel.com',
        jwks_uri: 'https://vercel.com',
      })
    );
    const _as = await as();
    const accessTokenPayload = { team_id: randomUUID() };
    jwtVerifyMock.mockResolvedValueOnce({
      payload: accessTokenPayload,
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const authorizationResult = {
      device_code: randomUUID(),
      user_code: randomUUID(),
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete: `https://vercel.com/device?code=${randomUUID()}`,
      expires_in: 30,
      interval: 0.005,
    };

    fetchMock.mockResolvedValueOnce(mockResponse(authorizationResult));

    const pollCount = 2;
    const tokenResult = await simulateTokenPolling(
      pollCount,
      mockResponse({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 1,
        scope: 'openid',
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

    expect(fetchMock).toHaveBeenCalledTimes(pollCount + 3);

    expect(fetchMock).toHaveBeenNthCalledWith(
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
      new Headers(fetchMock.mock.calls[0][1]?.headers).get('user-agent'),
      'Passing the correct user agent so the user can verify'
    ).toBe(ua);

    expect(
      fetchMock.mock.calls[1][1]?.body?.toString(),
      'Requesting a device code with the correct params'
    ).toBe(
      new URLSearchParams({
        client_id: VERCEL_CLI_CLIENT_ID,
        scope: tokenResult.scope,
      }).toString()
    );

    for (let i = 3; i <= fetchMock.mock.calls.length; i++) {
      expect(fetchMock).toHaveBeenNthCalledWith(
        i,
        _as.token_endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'user-agent': ua,
          },
          body: expect.any(URLSearchParams),
        })
      );
    }

    expect(
      fetchMock.mock.calls[pollCount + 1][1]?.body?.toString(),
      'Polling with the received device code'
    ).toBe(
      new URLSearchParams({
        client_id: VERCEL_CLI_CLIENT_ID,
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
