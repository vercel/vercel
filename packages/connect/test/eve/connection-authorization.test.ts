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

    const definition = connect(
      'oauth/connection-auth-revoke'
    ) as InteractiveAuthorizationDefinition & {
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

    const definition = connect(
      'oauth/connection-auth-revoke-fallback'
    ) as InteractiveAuthorizationDefinition & {
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
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          request: 'req_1',
          verifier: 'ver_1',
          url: 'https://connect.vercel.com/authorize/req_1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

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

    const definition = connect(
      'oauth/subject-default'
    ) as InteractiveAuthorizationDefinition;

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
