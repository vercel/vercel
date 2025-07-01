import { beforeEach, describe, expect, it } from 'vitest';
import logout from '../../../../src/commands/logout';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import _fetch, { type Response } from 'node-fetch';
import {
  as,
  VERCEL_CLI_CLIENT_ID,
  userAgent,
} from '../../../../src/util/oauth';
import { randomUUID } from 'node:crypto';

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

beforeEach(() => {
  vi.resetAllMocks();
  client.emptyAuthConfig();
});

describe('logout', () => {
  it('successful logout', async () => {
    fetch.mockResolvedValueOnce(
      mockResponse({
        issuer: 'https://vercel.com',
        device_authorization_endpoint: 'https://vercel.com',
        token_endpoint: 'https://vercel.com',
        revocation_endpoint: 'https://vercel.com',
        jwks_uri: 'https://vercel.com',
      })
    );
    const _as = await as();

    fetch.mockResolvedValueOnce(mockResponse({}));

    client.setArgv('logout');
    client.authConfig.type = 'oauth';
    client.authConfig.token = randomUUID();
    const tokenBefore = client.authConfig.token;
    client.config.currentTeam = randomUUID();
    const teamBefore = client.config.currentTeam;
    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "logout"').toBe(0);
    await expect(client.stderr).toOutput('Success! Logged out!');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      _as.revocation_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: expect.any(URLSearchParams),
      })
    );

    expect(
      fetch.mock.calls[1][1]?.body?.toString(),
      'Requesting token revocation with the correct params'
    ).toBe(
      new URLSearchParams({
        token: tokenBefore,
        client_id: VERCEL_CLI_CLIENT_ID,
      }).toString()
    );

    const tokenAfter = client.authConfig.token;
    expect(tokenAfter).not.toBe(tokenBefore);
    expect(tokenAfter).toBeUndefined();

    const teamAfter = client.config.currentTeam;
    expect(teamAfter).not.toBe(teamBefore);
    expect(teamAfter).toBeUndefined();
  });

  it('failed logout', async () => {
    const invalidResponse = {
      error: 'invalid_request',
      error_description:
        'The request is missing a required parameter, includes an unsupported parameter value (other than grant type), repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.',
    };
    fetch.mockResolvedValueOnce(mockResponse(invalidResponse, false));

    client.setArgv('logout', '--debug');
    client.authConfig.token = randomUUID();
    client.authConfig.type = 'oauth';
    const tokenBefore = client.authConfig.token;
    client.config.currentTeam = randomUUID();
    const teamBefore = client.config.currentTeam;

    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "login"').toBe(1);

    const output = await client.stderr.getFullOutput();
    expect(output).toMatch(invalidResponse.error);
    expect(output).toMatch(invalidResponse.error_description);
    expect(output).not.toMatch('Logged out!');
    expect(output).toMatch('Failed during logout');

    // Ensure that even if token revocation fails,
    // token and team are still deleted
    const tokenAfter = client.authConfig.token;
    expect(tokenAfter).not.toBe(tokenBefore);
    expect(tokenAfter).toBeUndefined();

    const teamAfter = client.config.currentTeam;
    expect(teamAfter).not.toBe(teamBefore);
    expect(teamAfter).toBeUndefined();
  });

  it('if no token, do nothing', async () => {
    client.setArgv('logout');
    delete client.authConfig.token;
    client.authConfig.type = 'oauth';
    expect(client.authConfig.token).toBeUndefined();

    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "login"').toBe(0);
    await expect(client.stderr).toOutput(
      'Not currently logged in, so `vercel logout` did nothing'
    );
    expect(client.authConfig.token).toBeUndefined();
  });
});
