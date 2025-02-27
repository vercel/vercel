import { beforeEach, describe, expect, it, type MockInstance } from 'vitest';
import { logout } from '../../../../src/commands/logout/future';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import fetch, { type Response } from 'node-fetch';
import { as, VERCEL_CLI_CLIENT_ID } from '../../../../src/util/oauth';
import { randomUUID } from 'node:crypto';
import ua from '../../../../src/util/ua';

const fetchMock = fetch as unknown as MockInstance<typeof fetch>;

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

describe('logout --future', () => {
  it('successful logout', async () => {
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

    fetchMock.mockResolvedValueOnce(mockResponse({}));

    client.setArgv('logout', '--future');
    client.authConfig.token = randomUUID();
    const tokenBefore = client.authConfig.token;
    client.config.currentTeam = randomUUID();
    const teamBefore = client.config.currentTeam;
    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "logout --future"').toBe(0);
    await expect(client.stderr).toOutput('Success! Logged out!');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      _as.revocation_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': ua,
        },
        body: expect.any(URLSearchParams),
      })
    );

    expect(
      fetchMock.mock.calls[1][1]?.body?.toString(),
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
    fetchMock.mockResolvedValueOnce(mockResponse(invalidResponse, false));

    client.setArgv('logout', '--future', '--debug');
    client.authConfig.token = randomUUID();
    const tokenBefore = client.authConfig.token;
    client.config.currentTeam = randomUUID();
    const teamBefore = client.config.currentTeam;

    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "login --future"').toBe(1);

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
    client.setArgv('logout', '--future');
    delete client.authConfig.token;
    expect(client.authConfig.token).toBeUndefined();

    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "login --future"').toBe(0);
    await expect(client.stderr).toOutput(
      'Not currently logged in, so `vercel logout --future` did nothing'
    );
    expect(client.authConfig.token).toBeUndefined();
  });
});
