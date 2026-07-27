import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as open from 'open';
import _fetch, {
  Headers,
  Response,
  type Request,
} from '../../../../src/util/fetch';
import * as oauth from '../../../../src/util/oauth';
import { withEnvChallengeRecovery } from '../../../../src/util/env/challenge-recovery';
import { client } from '../../../mocks/client';

const fetch = vi.mocked(_fetch);

vi.mock('../../../../src/util/fetch', async () => ({
  ...(await vi.importActual('../../../../src/util/fetch')),
  default: vi.fn(),
}));

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    clone: () => ({ text: async () => JSON.stringify(data) }),
    json: async () => data,
  } as unknown as Response;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function challengeError() {
  return Object.assign(new Error('Challenge required'), {
    status: 403,
    code: 'challenge_required',
    wwwAuthenticate:
      'Bearer error="insufficient_user_authentication", acr_values="urn:vercel:loa:sudo"',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  client.authConfig = {
    token: 'vca_rotated',
    refreshToken: 'vcr_stale',
  };
  client.stdin.isTTY = true;
  client.nonInteractive = false;
});

describe('Environment Variable challenge recovery integration', () => {
  it('opens a clean browser login and retries after a stale step-up refresh token', async () => {
    const authorizationResult = {
      device_code: 'device-code',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete:
        'https://vercel.com/oauth/device?user_code=ABCD-EFGH',
      expires_in: 30,
      interval: 0.005,
    };
    const tokenResult = {
      access_token: 'vca_recovered',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'vcr_recovered',
      scope: 'openid offline_access',
    };

    fetch.mockImplementation(async (_url, init) => {
      if (!init?.body) {
        return mockResponse({
          issuer: 'https://vercel.com',
          device_authorization_endpoint: 'https://vercel.com',
          token_endpoint: 'https://vercel.com',
          revocation_endpoint: 'https://vercel.com',
          jwks_uri: 'https://vercel.com',
          introspection_endpoint: 'https://vercel.com',
        });
      }

      const body = init.body.toString();
      if (body.includes('refresh_token=vcr_stale')) {
        return mockResponse(
          {
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid.',
          },
          false
        );
      }
      if (
        body.includes(
          'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
        )
      ) {
        return mockResponse(tokenResult);
      }
      return mockResponse(authorizationResult);
    });

    const error = challengeError();
    const readEnvironmentVariables = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('environment-records');

    await expect(
      withEnvChallengeRecovery(client, readEnvironmentVariables)
    ).resolves.toBe('environment-records');

    const requestBodies = fetch.mock.calls.map(([, init]) =>
      init?.body?.toString()
    );
    expect(requestBodies).toContain(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        refresh_token: 'vcr_stale',
        acr_values: 'urn:vercel:loa:sudo',
      }).toString()
    );
    expect(requestBodies).toContain(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        scope: 'openid offline_access',
      }).toString()
    );
    expect(open.default).toHaveBeenCalledWith(
      authorizationResult.verification_uri_complete
    );
    expect(readEnvironmentVariables).toHaveBeenCalledTimes(2);
    expect(client.authConfig).toMatchObject({
      token: 'vca_recovered',
      refreshToken: 'vcr_recovered',
    });
    expect(client.getFullOutput()).toContain(
      "Couldn't refresh the saved login. Starting a new login."
    );
    expect(client.getFullOutput()).not.toContain(
      'Device authorization request failed'
    );
  });

  it('opens a clean browser login before the request when an expired session fails token refresh', async () => {
    client.authConfig = {
      token: 'vca_expired',
      expiresAt: 0,
      refreshToken: 'vcr_stale',
    };

    const authorizationResult = {
      device_code: 'device-code',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://vercel.com/device',
      verification_uri_complete:
        'https://vercel.com/oauth/device?user_code=ABCD-EFGH',
      expires_in: 30,
      interval: 0.005,
    };
    const tokenResult = {
      access_token: 'vca_recovered',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'vcr_recovered',
      scope: 'openid offline_access',
    };
    let environmentRequests = 0;

    fetch.mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const body = init?.body?.toString();

      if (url.endsWith('.well-known/openid-configuration')) {
        return jsonResponse({
          issuer: 'https://vercel.com',
          device_authorization_endpoint: 'https://vercel.com',
          token_endpoint: 'https://vercel.com',
          revocation_endpoint: 'https://vercel.com',
          jwks_uri: 'https://vercel.com',
          introspection_endpoint: 'https://vercel.com',
        });
      }
      if (url.includes('/v3/env/pull/')) {
        environmentRequests += 1;
        const authorization = new Headers(init?.headers).get('authorization');
        if (authorization === 'Bearer vca_recovered') {
          return jsonResponse({ env: { EXAMPLE: 'value' }, buildEnv: {} });
        }
        return jsonResponse(
          {
            error: {
              code: 'forbidden',
              message: 'The request is missing an authentication token',
              missingToken: true,
            },
          },
          403
        );
      }
      if (body?.includes('grant_type=refresh_token')) {
        return jsonResponse(
          {
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid.',
          },
          400
        );
      }
      if (
        body?.includes(
          'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
        )
      ) {
        return jsonResponse(tokenResult);
      }
      return jsonResponse(authorizationResult);
    });

    await expect(
      withEnvChallengeRecovery(client, () =>
        client.fetch('/v3/env/pull/project-id')
      )
    ).resolves.toEqual({ env: { EXAMPLE: 'value' }, buildEnv: {} });

    expect(environmentRequests).toBe(1);
    expect(open.default).toHaveBeenCalledWith(
      authorizationResult.verification_uri_complete
    );
    expect(client.authConfig).toMatchObject({
      token: 'vca_recovered',
      refreshToken: 'vcr_recovered',
    });
  });
});
