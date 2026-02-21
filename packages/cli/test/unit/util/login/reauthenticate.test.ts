import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import reauthenticate from '../../../../src/util/login/reauthenticate';
import { client } from '../../../mocks/client';
import _fetch, { type Response } from 'node-fetch';
import * as oauth from '../../../../src/util/oauth';
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

function simulateTokenPolling(pollCount: number, finalResponse: Response) {
  for (let i = 0; i < pollCount; i++) {
    fetch.mockResolvedValueOnce(
      mockResponse({ error: 'authorization_pending' }, false)
    );
  }
  fetch.mockResolvedValueOnce(finalResponse);
  return finalResponse.json();
}

// Cache the OAuth discovery metadata once before all tests
beforeAll(async () => {
  fetch.mockResolvedValueOnce(
    mockResponse({
      issuer: 'https://vercel.com',
      device_authorization_endpoint: 'https://vercel.com',
      token_endpoint: 'https://vercel.com',
      revocation_endpoint: 'https://vercel.com',
      jwks_uri: 'https://vercel.com',
      introspection_endpoint: 'https://vercel.com',
    })
  );
  await oauth.as();
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('reauthenticate', () => {
  it('appends team_id to verification URL for SAML-enforced team', async () => {
    const teamId = 'team_test123';
    const userCode = 'ABCD-EFGH';
    const authorizationResult = {
      device_code: randomUUID(),
      user_code: userCode,
      verification_uri: 'https://vercel.com/oauth/device',
      verification_uri_complete: `https://vercel.com/oauth/device?user_code=${userCode}`,
      expires_in: 30,
      interval: 0.005,
    };

    fetch.mockResolvedValueOnce(mockResponse(authorizationResult));

    const pollCount = 1;
    const tokenResult = await simulateTokenPolling(
      pollCount,
      mockResponse({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: randomUUID(),
        scope: 'openid offline_access',
      })
    );

    client.reset();

    const resultPromise = reauthenticate(client, {
      teamId,
      scope: 'vercel',
      enforced: true,
    });

    // The verification URL should include &team_id=team_test123
    await expect(client.stderr).toOutput(`team_id=${teamId}`);

    const result = await resultPromise;

    expect(typeof result).not.toBe('number');

    // Verify credentials were saved
    expect(client.authConfig.token).toBe(tokenResult.access_token);
  });

  it('does not append team_id when teamId is null', async () => {
    const userCode = 'WXYZ-1234';
    const authorizationResult = {
      device_code: randomUUID(),
      user_code: userCode,
      verification_uri: 'https://vercel.com/oauth/device',
      verification_uri_complete: `https://vercel.com/oauth/device?user_code=${userCode}`,
      expires_in: 30,
      interval: 0.005,
    };

    fetch.mockResolvedValueOnce(mockResponse(authorizationResult));

    const pollCount = 1;
    const tokenResult = await simulateTokenPolling(
      pollCount,
      mockResponse({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid offline_access',
      })
    );

    client.reset();

    const resultPromise = reauthenticate(client, {
      teamId: null,
      scope: 'my-team',
      enforced: false,
    });

    // The verification URL should NOT include team_id, just user_code
    await expect(client.stderr).toOutput(`user_code=${userCode}`);

    const result = await resultPromise;

    expect(typeof result).not.toBe('number');

    // Verify credentials were saved
    expect(client.authConfig.token).toBe(tokenResult.access_token);
  });

  it('returns 1 when device code flow fails', async () => {
    // Device authorization request fails
    fetch.mockResolvedValueOnce(mockResponse({ error: 'server_error' }, false));

    client.reset();

    const result = await reauthenticate(client, {
      teamId: 'team_test123',
      scope: 'vercel',
      enforced: true,
    });

    expect(result).toBe(1);
  });
});
