import { describe, expect, it, type MockInstance } from 'vitest';
import { client } from '../../../mocks/client';
import { randomUUID } from 'node:crypto';
import fetch, { type Response } from 'node-fetch';

import { vi } from 'vitest';
import { jwtVerify } from 'jose';
import { as } from '../../../../src/util/oauth';

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

describe('OAuth Token Refresh', () => {
  it('should refresh the token when it is expired', async () => {
    const _as = await as();

    const refreshToken = randomUUID();
    const accessToken = randomUUID();
    client.authConfig = {
      type: 'oauth',
      token: accessToken,
      expiresAt: Date.now(),
      refreshToken,
      refreshTokenExpiresAt: Date.now(),
    };

    fetchMock.mockResolvedValueOnce(
      mockResponse({
        access_token: randomUUID(),
        refresh_token: randomUUID(),
      })
    );

    // Access token payload
    jwtVerifyMock.mockResolvedValueOnce({
      payload: {},
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    // Refresh token payload
    jwtVerifyMock.mockResolvedValueOnce({
      payload: {},
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    // TODO: Execute a command that triggers an API call
    // Eg.: cli('whoami');

    expect(fetchMock).toHaveBeenCalledWith(
      _as.token_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': expect.any(String),
        },
        body: expect.any(URLSearchParams),
      })
    );

    expect(client.authConfig.refreshToken).not.toBe(refreshToken);
    expect(client.authConfig.token).not.toBe(accessToken);
  });
});
