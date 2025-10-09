import { vi, it, expect } from 'vitest';
import { type AuthorizationServerMetadata, OAuth } from './oauth';

globalThis.fetch = vi.fn();
const fetchMock = {
  ...vi.mocked(globalThis.fetch),
  mockResponse(url: string, response: Response) {
    fetchMock.mockImplementationOnce(async input => {
      if (input.toString() === url.toString()) {
        return Promise.resolve(response);
      }
      throw new Error(`Unexpected fetch call: ${input}`);
    });
  },
};

it('can initialize OAuth client', async () => {
  const issuer = 'https://issuer';
  fetchMock.mockResponse(
    `${issuer}/.well-known/openid-configuration`,
    new Response(
      JSON.stringify({
        issuer,
        device_authorization_endpoint: `${issuer}/device-authorization`,
        token_endpoint: `${issuer}/token`,
        revocation_endpoint: `${issuer}/token/revoke`,
        jwks_uri: `${issuer}/.well-known/jwks`,
        introspection_endpoint: `${issuer}/token/introspect`,
      } satisfies AuthorizationServerMetadata),
      { headers: { 'Content-Type': 'application/json' } }
    )
  );

  const oauth = OAuth({
    issuer: new URL(issuer),
    clientId: 'id',
    userAgent: 'agent',
  });

  const client = await oauth.init();

  expect(client).toMatchInlineSnapshot(`
    {
      "as": {
        "device_authorization_endpoint": "https://issuer/device-authorization",
        "introspection_endpoint": "https://issuer/token/introspect",
        "issuer": "https://issuer",
        "jwks_uri": "https://issuer/.well-known/jwks",
        "revocation_endpoint": "https://issuer/token/revoke",
        "token_endpoint": "https://issuer/token",
      },
      "authorizationServerMetadata": [Function],
      "deviceAccessTokenRequest": [Function],
      "deviceAuthorizationRequest": [Function],
      "init": [Function],
      "introspectToken": [Function],
      "processTokenResponse": [Function],
      "refreshToken": [Function],
      "revokeToken": [Function],
    }
  `);
});
