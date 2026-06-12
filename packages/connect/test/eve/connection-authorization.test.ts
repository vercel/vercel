import { getVercelOidcToken } from '@vercel/oidc';
import type {
  ConnectionPrincipal,
  InteractiveAuthorizationDefinition,
} from 'eve/connections';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../../src/eve/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const PRINCIPAL: ConnectionPrincipal = {
  type: 'user',
  id: 'user_evict',
  issuer: 'https://oidc.vercel.com',
};

describe('connect() adapter evict', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('purges the connector token cache so the next getToken re-fetches', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonTokenResponse('tok_stale'))
      .mockResolvedValueOnce(jsonTokenResponse('tok_fresh'));

    const definition = connect(
      'oauth/connection-auth-evict'
    ) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
      }) => Promise<void>;
    };

    const first = await definition.getToken({ principal: PRINCIPAL });
    // Without eviction this would serve `tok_stale` from the cache.
    const cached = await definition.getToken({ principal: PRINCIPAL });

    await definition.evict({ principal: PRINCIPAL });
    const refetched = await definition.getToken({ principal: PRINCIPAL });

    expect(first.token).toBe('tok_stale');
    expect(cached.token).toBe('tok_stale');
    expect(refetched.token).toBe('tok_fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tears the grant down at Connect when called with revoke:true', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonTokenResponse('tok_initial'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonTokenResponse('tok_reauthorized'));

    const definition = connect(
      'oauth/connection-auth-revoke'
    ) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
        readonly revoke?: boolean;
      }) => Promise<void>;
    };

    const first = await definition.getToken({ principal: PRINCIPAL });
    await definition.evict({ principal: PRINCIPAL, revoke: true });
    const refetched = await definition.getToken({ principal: PRINCIPAL });

    expect(first.token).toBe('tok_initial');
    expect(refetched.token).toBe('tok_reauthorized');

    const [revokeUrl, revokeInit] = fetchMock.mock.calls[1];
    expect(revokeUrl).toBe(
      'https://api.vercel.com/v1/connect/connectors/oauth%2Fconnection-auth-revoke/tokens'
    );
    expect(revokeInit).toMatchObject({ method: 'DELETE' });
    expect(JSON.parse(revokeInit.body as string)).toMatchObject({
      subject: { type: 'user', id: PRINCIPAL.id },
    });
  });

  it('falls back to a local cache drop when the revoke request fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonTokenResponse('tok_before'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'server_error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(jsonTokenResponse('tok_after'));

    const definition = connect(
      'oauth/connection-auth-revoke-fallback'
    ) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
        readonly revoke?: boolean;
      }) => Promise<void>;
    };

    const before = await definition.getToken({ principal: PRINCIPAL });
    // A failed revoke must not throw out of evict.
    await expect(
      definition.evict({ principal: PRINCIPAL, revoke: true })
    ).resolves.toBeUndefined();
    const after = await definition.getToken({ principal: PRINCIPAL });

    expect(before.token).toBe('tok_before');
    expect(after.token).toBe('tok_after');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('connect() adapter startAuthorization', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('threads the service display name reported by Connect onto the challenge as displayName', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonAuthorizeResponse({ connector: SALESFORCE_CONNECTOR })
    );

    const definition = connect('oauth/connection-auth-display-name');
    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
    });

    // The service name ("Sign in with Salesforce"), not the connector's
    // own name — the consent screen identifies the specific app.
    expect(challenge).toMatchObject({
      url: 'https://connect.vercel.com/authorize/abc',
      displayName: 'Salesforce',
    });
  });

  it('falls back to the connector name when the service has no display name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonAuthorizeResponse({
        connector: { ...SALESFORCE_CONNECTOR, serviceName: undefined },
      })
    );

    const definition = connect('oauth/connection-auth-unknown-service');
    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
    });

    expect(challenge).toMatchObject({ displayName: 'Acme GTM Bot' });
  });

  it('prefers the author-provided displayName over the server-reported names', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonAuthorizeResponse({ connector: SALESFORCE_CONNECTOR })
    );

    const definition = connect({
      connector: 'oauth/connection-auth-display-name-override',
      displayName: 'Sales Cloud',
    });
    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
    });

    expect(challenge).toMatchObject({ displayName: 'Sales Cloud' });
  });

  it('omits displayName when neither the author nor Connect provide one', async () => {
    fetchMock.mockResolvedValueOnce(jsonAuthorizeResponse());

    const definition = connect('oauth/connection-auth-no-display-name');
    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
    });

    expect(challenge).not.toHaveProperty('displayName');
  });
});

const SALESFORCE_CONNECTOR = {
  id: 'scl_salesforce',
  uid: 'oauth/connection-auth-salesforce',
  type: 'oauth',
  service: 'salesforce',
  serviceName: 'Salesforce' as string | undefined,
  name: 'Acme GTM Bot',
};

function jsonAuthorizeResponse(extra?: {
  connector?: typeof SALESFORCE_CONNECTOR;
}): Response {
  return new Response(
    JSON.stringify({
      request: 'req_1',
      verifier: 'ver_1',
      url: 'https://connect.vercel.com/authorize/abc',
      deviceCode: 'ABCD-1234',
      ...extra,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function jsonTokenResponse(token: string): Response {
  return new Response(
    JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: {
        id: 'scl_evict',
        uid: 'oauth/connection-auth-evict',
        type: 'oauth',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
