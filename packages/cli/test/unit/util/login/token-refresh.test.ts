import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { randomUUID } from 'node:crypto';
import _fetch, { Request, Response } from '../../../../src/util/fetch';

import whoami from '../../../../src/commands/whoami';
import { Chance } from 'chance';
import { performDeviceCodeFlow } from '../../../../src/commands/login/future';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

const fetch = vi.mocked(_fetch);
vi.mock('../../../../src/util/fetch', async () => ({
  ...(await vi.importActual('../../../../src/util/fetch')),
  default: vi.fn(),
}));
vi.mock('../../../../src/commands/login/future', () => ({
  performDeviceCodeFlow: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(performDeviceCodeFlow).mockReset();
  client.cwd = setupTmpDir();
  delete client.config.currentTeam;
  client.nonInteractive = false;
});

describe('OAuth Token Refresh', () => {
  it('should refresh the token when it is expired', async () => {
    const refreshToken = randomUUID();
    const accessToken = randomUUID();
    client.authConfig = {
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
      introspection_endpoint: 'https://introspection/',
    };
    fetch.mockImplementation(init => {
      const url = init instanceof Request ? init.url : init.toString();

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

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);

    expect(client.stderr).toOutput(name);
    expect(client.authConfig.token).toBe(newAccessToken);
    expect(client.authConfig.refreshToken).toBe(newRefreshToken);
  });

  it('should empty the token config if the refresh token is missing', async () => {
    client.authConfig = {
      token: randomUUID(),
      expiresAt: 0,
    };

    const name = Chance().name();

    const exitCode = await whoami(client);
    expect(exitCode).toBe(0);

    fetch.mockImplementation(init => {
      const url = init instanceof Request ? init.url : init.toString();

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

  it('should start a clean device login when a stored refresh token is invalid', async () => {
    client.authConfig = {
      token: 'vca_expired',
      expiresAt: 0,
      refreshToken: 'vcr_stale',
    };
    vi.mocked(performDeviceCodeFlow).mockResolvedValueOnce({
      access_token: 'vca_recovered',
      expires_in: 3600,
      refresh_token: 'vcr_recovered',
    });

    const discovery = {
      issuer: 'https://vercel.com/',
      device_authorization_endpoint: 'https://device/',
      token_endpoint: 'https://token/',
      revocation_endpoint: 'https://revoke/',
      jwks_uri: 'https://jwks/',
      introspection_endpoint: 'https://introspection/',
    };
    fetch.mockImplementation(init => {
      const url = init instanceof Request ? init.url : init.toString();

      if (url.endsWith('.well-known/openid-configuration')) {
        return json(discovery);
      }
      if (url === discovery.token_endpoint) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Refresh token is invalid.',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }
      if (url.endsWith('/v2/user')) {
        return json({
          user: {
            id: randomUUID(),
            email: Chance().email(),
            username: 'recovered-user',
          },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(whoami(client)).resolves.toBe(0);

    await expect(client.stderr).toOutput(
      "Couldn't refresh the saved login. Starting a new login."
    );
    await expect(client.stderr).toOutput('recovered-user');
    expect(performDeviceCodeFlow).toHaveBeenCalledWith(client);
    expect(client.authConfig).toMatchObject({
      token: 'vca_recovered',
      refreshToken: 'vcr_recovered',
    });
  });

  it.each([
    [
      'non-interactive mode',
      () => {
        client.nonInteractive = true;
      },
    ],
    [
      'a non-TTY session',
      () => {
        client.stdin.isTTY = false;
      },
    ],
  ])('should not start a clean device login in %s', async (_name, setup) => {
    client.authConfig = {
      token: 'vca_expired',
      expiresAt: 0,
      refreshToken: 'vcr_stale',
    };
    setup();

    const discovery = {
      issuer: 'https://vercel.com/',
      device_authorization_endpoint: 'https://device/',
      token_endpoint: 'https://token/',
      revocation_endpoint: 'https://revoke/',
      jwks_uri: 'https://jwks/',
      introspection_endpoint: 'https://introspection/',
    };
    fetch.mockImplementation(init => {
      const url = init instanceof Request ? init.url : init.toString();

      if (url.endsWith('.well-known/openid-configuration')) {
        return json(discovery);
      }
      if (url === discovery.token_endpoint) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Refresh token is invalid.',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }
      if (url.endsWith('/v2/user')) {
        return json({
          user: {
            id: randomUUID(),
            email: Chance().email(),
            username: 'unauthenticated-user',
          },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(whoami(client)).resolves.toBe(0);

    await expect(client.stderr).toOutput('unauthenticated-user');
    expect(performDeviceCodeFlow).not.toHaveBeenCalled();
    expect(client.authConfig.token).toBeUndefined();
    expect(client.authConfig.refreshToken).toBeUndefined();
  });
});

function json(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
