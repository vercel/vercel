import { beforeEach, describe, expect, it, type MockInstance } from 'vitest';
import { future as logout } from '../../../../src/commands/logout/future';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';
import fetch, { type Response } from 'node-fetch';
import { as } from '../../../../src/util/oauth';
import { randomUUID } from 'node:crypto';

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
    fetchMock.mockResolvedValueOnce(mockResponse({}));

    client.setArgv('logout', '--future');
    client.authConfig.token = randomUUID();
    client.config.currentTeam = randomUUID();
    const tokenBefore = client.authConfig.token;
    const teamBefore = client.config.currentTeam;
    const exitCode = await logout(client);
    expect(exitCode, 'exit code for "login --future"').toBe(0);
    await expect(client.stderr).toOutput('Success! Logged out!');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      as.revocation_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      })
    );

    expect(
      fetchMock.mock.calls[0][1]?.body?.toString(),
      'Requesting token revocation with the correct params'
    ).toBe(
      new URLSearchParams({
        token: tokenBefore,
        client_id: as.client_id,
      }).toString()
    );

    const tokenAfter = client.authConfig.token;
    expect(tokenAfter).not.toBe(tokenBefore);
    expect(tokenAfter).toBeUndefined();

    const teamAfter = client.config.currentTeam;
    expect(teamAfter).not.toBe(teamBefore);
    expect(teamAfter).toBeUndefined();
  });

  it.todo('failed logout');
});
