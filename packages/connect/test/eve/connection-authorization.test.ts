import { getVercelOidcToken } from '@vercel/oidc';
import type {
  ConnectionPrincipal,
  InteractiveAuthorizationDefinition,
} from 'eve/connections';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connect,
  type EveConnectionAuthorizationContext,
} from '../../src/eve/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const PRINCIPAL: ConnectionPrincipal = {
  type: 'user',
  id: 'user_evict',
  issuer: 'https://oidc.vercel.com',
};

const CONNECTION: EveConnectionAuthorizationContext = {
  url: 'https://mcp.example.com/sse',
};

describe('connect() adapter provisioning', () => {
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

  it('provisions and links a UID connector before fetching a token', async () => {
    const connector = 'mcp.example.com/provisioned';
    fetchMock
      .mockResolvedValueOnce(jsonProvisionResponse(connector))
      .mockResolvedValueOnce(jsonTokenResponse('tok_provisioned', connector));

    const definition = connect(connector) as InteractiveAuthorizationDefinition;

    const result = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(result.token).toBe('tok_provisioned');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [provisionUrl, provisionInit] = fetchMock.mock.calls[0];
    expect(provisionUrl).toBe(
      'https://api.vercel.com/v1/connect/connectors/managed/oauth'
    );
    expect(provisionInit).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer oidc_token',
      }),
    });
    expect(JSON.parse(provisionInit.body as string)).toEqual({
      serverUrl: CONNECTION.url,
      uid: connector,
    });

    const [tokenUrl] = fetchMock.mock.calls[1];
    expect(tokenUrl).toBe(
      'https://api.vercel.com/v1/connect/token/mcp.example.com%2Fprovisioned'
    );
  });

  it('reuses successful provisioning for the same connector and server URL', async () => {
    const connector = 'mcp.example.com/provision-cache';
    fetchMock
      .mockResolvedValueOnce(jsonProvisionResponse(connector))
      .mockResolvedValueOnce(jsonTokenResponse('tok_first', connector))
      .mockResolvedValueOnce(jsonTokenResponse('tok_second', connector));

    const definition = connect({
      connector,
      validate: true,
    }) as InteractiveAuthorizationDefinition;

    const first = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });
    const second = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(first.token).toBe('tok_first');
    expect(second.token).toBe('tok_second');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.filter(
        ([url]) =>
          url === 'https://api.vercel.com/v1/connect/connectors/managed/oauth'
      )
    ).toHaveLength(1);
  });

  it('keeps provision cache entries scoped to the Vercel token', async () => {
    const connector = 'mcp.example.com/token-scoped-cache';
    fetchMock
      .mockResolvedValueOnce(jsonProvisionResponse(connector))
      .mockResolvedValueOnce(jsonTokenResponse('tok_project_a', connector))
      .mockResolvedValueOnce(jsonProvisionResponse(connector))
      .mockResolvedValueOnce(jsonTokenResponse('tok_project_b', connector));

    const projectA = connect({
      connector,
      validate: true,
      connectOptions: { vercelToken: 'oidc_project_a' },
    }) as InteractiveAuthorizationDefinition;
    const projectB = connect({
      connector,
      validate: true,
      connectOptions: { vercelToken: 'oidc_project_b' },
    }) as InteractiveAuthorizationDefinition;

    const first = await projectA.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });
    const second = await projectB.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(first.token).toBe('tok_project_a');
    expect(second.token).toBe('tok_project_b');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer oidc_project_a',
    });
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer oidc_project_b',
    });
  });

  it('provisions before starting an interactive authorization flow', async () => {
    const connector = 'mcp.example.com/start-authorization';
    fetchMock
      .mockResolvedValueOnce(jsonProvisionResponse(connector))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request: 'req_1',
            verifier: 'ver_1',
            url: 'https://connect.vercel.com/authorize/req_1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const definition = connect(connector) as InteractiveAuthorizationDefinition;

    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
      connection: CONNECTION,
      callbackUrl: 'https://example.com/callback',
    });

    expect(challenge.url).toBe('https://connect.vercel.com/authorize/req_1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v1/connect/connectors/managed/oauth'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.vercel.com/v1/connect/authorize/mcp.example.com%2Fstart-authorization'
    );
  });

  it('skips provisioning for opaque connector ids', async () => {
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_opaque'));

    const definition = connect(
      'scl_existing'
    ) as InteractiveAuthorizationDefinition;

    const result = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(result.token).toBe('tok_opaque');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v1/connect/token/scl_existing'
    );
  });

  it('falls back to token fetching when an existing connector is not managed OAuth', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'conflict',
              message:
                'A connector with uid "linear" already exists and is not an OAuth connector.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(jsonTokenResponse('tok_linear', 'linear'));

    const definition = connect('linear') as InteractiveAuthorizationDefinition;

    const result = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(result.token).toBe('tok_linear');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v1/connect/connectors/managed/oauth'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.vercel.com/v1/connect/token/linear'
    );
  });

  it('allows callers to disable provisioning', async () => {
    const connector = 'mcp.example.com/manual-link';
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_manual', connector));

    const definition = connect({
      connector,
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition;

    const result = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(result.token).toBe('tok_manual');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v1/connect/token/mcp.example.com%2Fmanual-link'
    );
  });
});

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

    const definition = connect({
      connector: 'oauth/connection-auth-evict',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
        readonly connection?: EveConnectionAuthorizationContext;
      }) => Promise<void>;
    };

    const first = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });
    // Without eviction this would serve `tok_stale` from the cache.
    const cached = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    await definition.evict({ principal: PRINCIPAL, connection: CONNECTION });
    const refetched = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

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

    const definition = connect({
      connector: 'oauth/connection-auth-revoke',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
        readonly connection?: EveConnectionAuthorizationContext;
        readonly revoke?: boolean;
      }) => Promise<void>;
    };

    const first = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });
    await definition.evict({
      principal: PRINCIPAL,
      connection: CONNECTION,
      revoke: true,
    });
    const refetched = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

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

    const definition = connect({
      connector: 'oauth/connection-auth-revoke-fallback',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition & {
      readonly evict: (opts: {
        readonly principal: ConnectionPrincipal;
        readonly connection?: EveConnectionAuthorizationContext;
        readonly revoke?: boolean;
      }) => Promise<void>;
    };

    const before = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });
    // A failed revoke must not throw out of evict.
    await expect(
      definition.evict({
        principal: PRINCIPAL,
        connection: CONNECTION,
        revoke: true,
      })
    ).resolves.toBeUndefined();
    const after = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(before.token).toBe('tok_before');
    expect(after.token).toBe('tok_after');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('connect() adapter subject mapping', () => {
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

  it('passes the principal and connection context to createSubject and sends its return as the token subject', async () => {
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_create_subject'));

    const createSubject = vi.fn(
      (
        principal: ConnectionPrincipal,
        ctx: EveConnectionAuthorizationContext
      ) => ({
        type: 'jwt-bearer' as const,
        sub: principal.type === 'user' ? principal.id : 'app',
        aud: ctx.url,
      })
    );

    const definition = connect({
      connector: 'oauth/subject-create',
      autoProvision: false,
      createSubject,
    }) as InteractiveAuthorizationDefinition;

    const result = await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(result.token).toBe('tok_create_subject');
    expect(createSubject).toHaveBeenCalledTimes(1);
    expect(createSubject).toHaveBeenCalledWith(PRINCIPAL, CONNECTION);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(
      'https://api.vercel.com/v1/connect/token/oauth%2Fsubject-create'
    );
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({
      subject: {
        type: 'jwt-bearer',
        sub: PRINCIPAL.type === 'user' ? PRINCIPAL.id : 'app',
        aud: CONNECTION.url,
      },
    });
  });

  it('threads the connection context into startAuthorization subjects', async () => {
    fetchMock.mockResolvedValueOnce(jsonAuthorizationResponse('req_1'));

    const createSubject = vi.fn(
      (
        _principal: ConnectionPrincipal,
        ctx: EveConnectionAuthorizationContext
      ) => ({
        type: 'jwt-bearer' as const,
        sub: 'user_evict',
        additionalClaims: { server_url: ctx.url },
      })
    );

    const definition = connect({
      connector: 'oauth/subject-start-auth',
      autoProvision: false,
      createSubject,
    }) as InteractiveAuthorizationDefinition;

    const { challenge } = await definition.startAuthorization({
      principal: PRINCIPAL,
      connection: CONNECTION,
      callbackUrl: 'https://example.com/callback',
    });

    expect(challenge.url).toBe('https://connect.vercel.com/authorize/req_1');
    expect(createSubject).toHaveBeenCalledWith(PRINCIPAL, CONNECTION);

    const [authorizeUrl, authorizeInit] = fetchMock.mock.calls[0];
    expect(authorizeUrl).toBe(
      'https://api.vercel.com/v1/connect/authorize/oauth%2Fsubject-start-auth'
    );
    expect(JSON.parse(authorizeInit.body as string)).toMatchObject({
      subject: {
        type: 'jwt-bearer',
        sub: 'user_evict',
        additionalClaims: { server_url: CONNECTION.url },
      },
      returnUrl: 'https://example.com/callback',
    });
  });

  it('passes an HTTPS eve webhook as both browser callback and Connect completion webhook', async () => {
    fetchMock.mockResolvedValueOnce(jsonAuthorizationResponse('req_webhook'));

    const definition = connect({
      connector: 'oauth/eve-webhook',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition;

    await definition.startAuthorization({
      principal: PRINCIPAL,
      connection: CONNECTION,
      webhook: 'https://eve.example.com/hooks/authorization-complete',
    });

    const [authorizeUrl, authorizeInit] = fetchMock.mock.calls[0];
    expect(authorizeUrl).toBe(
      'https://api.vercel.com/v1/connect/authorize/oauth%2Feve-webhook'
    );
    expect(JSON.parse(authorizeInit.body as string)).toMatchObject({
      returnUrl: 'https://eve.example.com/hooks/authorization-complete',
      webhook: 'https://eve.example.com/hooks/authorization-complete',
      deviceCode: true,
    });
  });

  it('uses a localhost eve webhook only as the browser callback for local development', async () => {
    fetchMock.mockResolvedValueOnce(jsonAuthorizationResponse('req_localhost'));

    const definition = connect({
      connector: 'oauth/eve-webhook-localhost',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition;

    await definition.startAuthorization({
      principal: PRINCIPAL,
      connection: CONNECTION,
      webhook: 'http://localhost:3000/hooks/authorization-complete',
    });

    const [, authorizeInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(authorizeInit.body as string);
    expect(body).toMatchObject({
      returnUrl: 'http://localhost:3000/hooks/authorization-complete',
      deviceCode: true,
    });
    expect(body).not.toHaveProperty('webhook');
  });

  it('prefers createSubject over principalToSubject when both are set', async () => {
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_precedence'));

    const createSubject = vi.fn(() => ({
      type: 'jwt-bearer' as const,
      sub: 'from_create_subject',
    }));
    const principalToSubject = vi.fn(() => ({
      type: 'user' as const,
      id: 'from_principal_to_subject',
    }));

    const definition = connect({
      connector: 'oauth/subject-precedence',
      autoProvision: false,
      createSubject,
      principalToSubject,
    }) as InteractiveAuthorizationDefinition;

    await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(createSubject).toHaveBeenCalledWith(PRINCIPAL, CONNECTION);
    expect(principalToSubject).not.toHaveBeenCalled();

    const [, tokenInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({
      subject: { type: 'jwt-bearer', sub: 'from_create_subject' },
    });
  });

  it('still honors the deprecated principalToSubject when createSubject is unset', async () => {
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_legacy_hook'));

    const principalToSubject = vi.fn(() => ({
      type: 'user' as const,
      id: 'legacy_mapped_id',
      issuer: 'https://legacy.example.com',
    }));

    const definition = connect({
      connector: 'oauth/subject-legacy',
      autoProvision: false,
      principalToSubject,
    }) as InteractiveAuthorizationDefinition;

    await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    expect(principalToSubject).toHaveBeenCalledWith(PRINCIPAL);

    const [, tokenInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({
      subject: {
        type: 'user',
        id: 'legacy_mapped_id',
        issuer: 'https://legacy.example.com',
      },
    });
  });

  it('falls back to the default principal mapping when neither hook is set', async () => {
    fetchMock.mockResolvedValueOnce(jsonTokenResponse('tok_default'));

    const definition = connect({
      connector: 'oauth/subject-default',
      autoProvision: false,
    }) as InteractiveAuthorizationDefinition;

    await definition.getToken({
      principal: PRINCIPAL,
      connection: CONNECTION,
    });

    const [, tokenInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({
      subject: {
        type: 'user',
        id: 'user_evict',
        issuer: 'https://oidc.vercel.com',
      },
    });
  });
});

function jsonAuthorizationResponse(request: string): Response {
  return new Response(
    JSON.stringify({
      request,
      verifier: `verifier_${request}`,
      url: `https://connect.vercel.com/authorize/${request}`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function jsonTokenResponse(
  token: string,
  uid = 'oauth/connection-auth-evict'
): Response {
  return new Response(
    JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: {
        id: 'scl_evict',
        uid,
        type: 'oauth',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function jsonProvisionResponse(uid: string): Response {
  return new Response(
    JSON.stringify({
      id: 'scl_provisioned',
      uid,
      type: 'oauth',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}
