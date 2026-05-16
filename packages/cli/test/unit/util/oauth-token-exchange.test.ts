import { beforeEach, describe, expect, it, vi } from 'vitest';
import _fetch, { Request, Response } from 'node-fetch';
import * as oauth from '../../../src/util/oauth';

const fetch = vi.mocked(_fetch);
vi.mock('node-fetch', async () => ({
  ...(await vi.importActual('node-fetch')),
  default: vi.fn(),
}));

describe('tokenExchangeRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('posts RFC 8693 OIDC token exchange params to the token endpoint', async () => {
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
        return json({
          access_token: 'vca_exchanged',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await oauth.tokenExchangeRequest({
      subject_token: 'header.payload.signature',
      team_id: 'team_123',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, tokenRequest] = fetch.mock.calls;
    expect(tokenRequest[0]).toEqual(new URL(discovery.token_endpoint));
    expect(tokenRequest[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': expect.any(String),
        }),
        body: expect.any(URLSearchParams),
      })
    );

    expect(tokenRequest[1]?.body?.toString()).toBe(
      new URLSearchParams({
        client_id: oauth.VERCEL_CLI_CLIENT_ID,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        subject_token: 'header.payload.signature',
        team_id: 'team_123',
      }).toString()
    );
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
