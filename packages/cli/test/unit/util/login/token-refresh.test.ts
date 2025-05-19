import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { randomUUID } from 'node:crypto';
import * as _fetch from 'node-fetch';
import * as jose from 'jose';

import whoami from '../../../../src/commands/whoami';
import { Chance } from 'chance';

const fetch = vi.mocked(_fetch.default);
vi.mock('node-fetch', async () => ({
  ...(await vi.importActual('node-fetch')),
  default: vi.fn(),
}));

const decodeJwt = vi.mocked(jose.decodeJwt);
vi.mock('jose', async () => ({
  ...(await vi.importActual('jose')),
  decodeJwt: vi.fn(),
}));

describe('OAuth Token Refresh', () => {
  it('should refresh the token when it is expired', async () => {
    const refreshToken = randomUUID();
    const accessToken = randomUUID();
    client.authConfig = {
      type: 'oauth',
      token: accessToken,
      expiresAt: 0,
      refreshToken,
    };

    const name = Chance().name();

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();

    const discovery = {
      issuer: 'https://vercel.com/',
      device_authorization_endpoint: 'https://device/',
      token_endpoint: 'https://token/',
      revocation_endpoint: 'https://revoke/',
      jwks_uri: 'https://jwks/',
    };
    fetch.mockImplementation(init => {
      const url = init instanceof _fetch.Request ? init.url : init.toString();

      // Mock the discovery document
      if (url.endsWith('.well-known/openid-configuration')) {
        return json(discovery);
      }

      // Mock the token endpoint
      if (url === discovery.token_endpoint) {
        return json({
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: newRefreshToken,
        });
      }

      // Mock the user endpoint, which gets called during client initialization
      if (url.endsWith('/v2/user')) {
        return json({
          user: { id: randomUUID(), email: Chance().email(), username: name },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    decodeJwt.mockResolvedValueOnce({ active: true });

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);

    expect(client.stderr).toOutput(name);
    expect(client.authConfig.token).toBe(newAccessToken);
    expect(client.authConfig.refreshToken).toBe(newRefreshToken);
  });

  it('should empty the token config if the refresh token is expired', async () => {
    client.authConfig = {
      type: 'oauth',
      token: randomUUID(),
      expiresAt: 0,
      refreshToken: randomUUID(),
    };

    const name = Chance().name();

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);

    fetch.mockImplementation(init => {
      const url = init instanceof _fetch.Request ? init.url : init.toString();

      const discovery = {
        issuer: 'https://vercel.com/',
        device_authorization_endpoint: 'https://device/',
        token_endpoint: 'https://token/',
        revocation_endpoint: 'https://revoke/',
        jwks_uri: 'https://jwks/',
      };

      // Mock the discovery document
      if (url.endsWith('.well-known/openid-configuration')) {
        return json(discovery);
      }

      // Mock the user endpoint, which gets called during client initialization
      if (url.endsWith('/v2/user')) {
        return json({
          user: { id: randomUUID(), email: Chance().email(), username: name },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    expect(client.stderr).toOutput(name);
    expect(client.authConfig.token).toBeUndefined();
    expect(client.authConfig.expiresAt).toBeUndefined();
    expect(client.authConfig.refreshToken).toBeUndefined();
  });
});

function json(data: unknown) {
  return Promise.resolve(
    new _fetch.Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
