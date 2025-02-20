import { beforeEach, describe, expect, it, type MockInstance } from 'vitest';
import { future as loginFuture } from '../../../../src/commands/login/future';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import fetch, { Headers, type Response } from 'node-fetch';
import { as } from '../../../../src/util/oauth';
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe('login --future', () => {
  it('sucessful login', async () => {
    const accessTokenPayload = { team_id: randomUUID() };
    jwtVerifyMock.mockResolvedValueOnce({
      payload: accessTokenPayload,
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const authorizationResult = {
      device_code: randomUUID(),
      user_code: randomUUID(),
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete: `https://vercel.com/device?code=${randomUUID()}`,
      expires_in: 1,
      interval: 1,
    };

    fetchMock.mockResolvedValueOnce(mockResponse(authorizationResult));

    const tokenResult = {
      access_token: randomUUID(),
      token_type: 'Bearer',
      expires_in: 1,
      scope: 'openid',
    };
    fetchMock.mockResolvedValueOnce(mockResponse(tokenResult));

    client.setArgv('login', '--future');
    const teamBefore = client.config.currentTeam;
    const tokenBefore = client.authConfig.token;

    const exitCode = await loginFuture(client);
    expect(exitCode, 'exit code for "login --future"').toBe(0);
    await expect(client.stderr).toOutput('Congratulations!');

    expect(
      fetchMock,
      'Requesting device authorization and polling token once'
    ).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      as.device_authorization_endpoint,
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
      fetchMock.mock.calls[0][1]?.body?.toString(),
      'Requesting a device code with the correct params'
    ).toBe(
      new URLSearchParams({
        client_id: as.client_id,
        scope: tokenResult.scope,
      }).toString()
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      as.token_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      })
    );

    expect(
      fetchMock.mock.calls[1][1]?.body?.toString(),
      'Polling with the received device code'
    ).toBe(
      new URLSearchParams({
        client_id: as.client_id,
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

  it.todo('/token polling');
  it.todo('Authorization request error');
  it.todo('Token request error');
});
