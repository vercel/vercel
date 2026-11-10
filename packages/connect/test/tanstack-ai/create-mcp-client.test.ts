/**
 * End-to-end tests for `@vercel/connect/tanstack-ai` against the real
 * `@tanstack/ai-mcp` `createMCPClient` and the official
 * `@modelcontextprotocol/sdk` Streamable HTTP transport. The MCP
 * server and its OAuth discovery endpoints are simulated with a
 * mocked `fetch` handed to the transport config; Connect itself is
 * mocked at the `getTokenResponse` / `startAuthorization` seam.
 */
import {
  createMCPClient,
  createMCPClients,
  MCPConnectionError,
} from '@tanstack/ai-mcp';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authorization from '../../src/authorization.js';
import {
  connectAuthProvider,
  connectMCPTransport,
  ConsentRequiredError,
  getConsentChallenge,
} from '../../src/tanstack-ai/index.js';
import * as token from '../../src/token.js';
import { UserAuthorizationRequiredError } from '../../src/token.js';

const CONNECTOR = 'oauth/linear';
const PARAMS = { subject: { type: 'user' as const, id: 'user_123' } };
const MCP_URL = 'https://mcp.example.com/mcp';
const CONSENT_URL = 'https://connect.vercel.com/consent/oauth/linear?req=abc';

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: unknown;
}

/**
 * Minimal Streamable-HTTP MCP server + OAuth discovery mock.
 * - Any MCP request without a bearer token => 401 + WWW-Authenticate.
 * - `initialize` / `tools/list` answered as plain JSON responses.
 * - `notifications/initialized` => 202; the follow-up GET SSE stream
 *   => 405 (the SDK tolerates servers that do not offer one).
 */
function mockServer(mcpUrl: string = MCP_URL): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  tokenRequests: number;
} {
  const requests: RecordedRequest[] = [];
  const state = { tokenRequests: 0 };
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    requests.push({
      url,
      method,
      authorization: headers.get('authorization'),
      body,
    });

    if (url.includes('/.well-known/oauth-protected-resource')) {
      return json({
        resource: mcpUrl,
        authorization_servers: ['https://as.example.com'],
      });
    }
    if (
      url.includes('/.well-known/oauth-authorization-server') ||
      url.includes('/.well-known/openid-configuration')
    ) {
      return json({
        issuer: 'https://as.example.com',
        authorization_endpoint: 'https://as.example.com/authorize',
        token_endpoint: 'https://as.example.com/token',
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.startsWith('https://as.example.com/token')) {
      state.tokenRequests++;
      return json({ error: 'invalid_client' }, 401);
    }

    if (!url.startsWith(mcpUrl)) {
      return new Response('not found', { status: 404 });
    }
    if (!headers.get('authorization')) {
      return new Response('unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer resource_metadata="${new URL(mcpUrl).origin}/.well-known/oauth-protected-resource"`,
        },
      });
    }
    if (method === 'GET') {
      return new Response(null, { status: 405 });
    }
    if (method === 'DELETE') {
      return new Response(null, { status: 200 });
    }
    switch (body?.method) {
      case 'initialize':
        return json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: body.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'mock', version: '0.0.0' },
          },
        });
      case 'notifications/initialized':
        return new Response(null, { status: 202 });
      case 'tools/list':
        return json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: [
              {
                name: 'create_issue',
                description: 'Create a Linear issue',
                inputSchema: {
                  type: 'object',
                  properties: { title: { type: 'string' } },
                },
              },
            ],
          },
        });
      default:
        return json({
          jsonrpc: '2.0',
          id: body?.id,
          error: { code: -32601, message: `unmocked ${body?.method}` },
        });
    }
  };

  return {
    fetch: fetchImpl,
    requests,
    get tokenRequests() {
      return state.tokenRequests;
    },
  };
}

describe('@vercel/connect/tanstack-ai × @tanstack/ai-mcp createMCPClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the Connect-minted bearer token to every MCP request and discovers tools', async () => {
    vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
      token: 'connect_access_token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
    });
    const start = vi.spyOn(authorization, 'startAuthorization');
    const server = mockServer();

    const client = await createMCPClient({
      transport: connectMCPTransport(
        { type: 'http', url: MCP_URL, fetch: server.fetch },
        CONNECTOR,
        PARAMS
      ),
    });
    try {
      const tools = await client.tools();
      expect(tools.map(t => t.name)).toEqual(['create_issue']);
    } finally {
      await client.close();
    }

    const mcpRequests = server.requests.filter(r => r.url.startsWith(MCP_URL));
    expect(mcpRequests.length).toBeGreaterThanOrEqual(3);
    for (const request of mcpRequests) {
      expect(request.authorization).toBe('Bearer connect_access_token');
    }
    expect(start).not.toHaveBeenCalled();
    expect(server.tokenRequests).toBe(0);
  });

  it("surfaces the Connect consent URL from createMCPClient before any request reaches the MCP server (connectMCPTransport, type: 'http' => eager)", async () => {
    vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
      new UserAuthorizationRequiredError('user must authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: CONSENT_URL,
    });
    const server = mockServer();

    let caught: unknown;
    try {
      await createMCPClient({
        transport: connectMCPTransport(
          { type: 'http', url: MCP_URL, fetch: server.fetch },
          CONNECTOR,
          PARAMS,
          { redirectUrl: 'https://app.example.com/integrations' }
        ),
      });
    } catch (err) {
      caught = err;
    }

    // TanStack wraps connect failures; the Connect error rides on `cause`.
    expect(caught).toBeInstanceOf(MCPConnectionError);
    expect((caught as MCPConnectionError).cause).toBeInstanceOf(
      ConsentRequiredError
    );
    expect(getConsentChallenge(caught)).toMatchObject({
      connector: CONNECTOR,
      subject: PARAMS.subject,
      url: CONSENT_URL,
    });

    // Eager mode: Connect answered authoritatively, so the transport
    // never hit the server or its OAuth discovery endpoints.
    expect(server.requests).toHaveLength(0);
    expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);
    expect(authorization.startAuthorization).toHaveBeenCalledWith(
      CONNECTOR,
      PARAMS,
      { callbackUrl: 'https://app.example.com/integrations' }
    );
  });

  it("plain connectAuthProvider (consent: 'transport' default) reaches redirectToAuthorization on the official SDK thanks to the non-empty redirectUrl placeholder", async () => {
    vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
      new UserAuthorizationRequiredError('user must authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: CONSENT_URL,
    });
    const server = mockServer();

    let caught: unknown;
    try {
      await createMCPClient({
        transport: {
          type: 'http',
          url: MCP_URL,
          fetch: server.fetch,
          // No redirectUrl configured: before the placeholder default the
          // official SDK took its client-credentials branch here and
          // never called redirectToAuthorization.
          authProvider: connectAuthProvider(CONNECTOR, PARAMS),
        },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MCPConnectionError);
    expect(getConsentChallenge(caught)?.url).toBe(CONSENT_URL);
    // The SDK never attempted a token request against the third-party
    // authorization server with the connector id as client_id.
    expect(server.tokenRequests).toBe(0);
    // Transport mode did go through the server's 401 + discovery first.
    expect(
      server.requests.some(
        r => r.url.startsWith(MCP_URL) && r.authorization === null
      )
    ).toBe(true);
    expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);
  });

  it('propagates configuration errors (connector not installed) without minting a consent challenge', async () => {
    vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
      new token.ConnectorInstallationRequiredError('install required')
    );
    const start = vi.spyOn(authorization, 'startAuthorization');
    const server = mockServer();

    let caught: unknown;
    try {
      await createMCPClient({
        transport: connectMCPTransport(
          { type: 'http', url: MCP_URL, fetch: server.fetch },
          CONNECTOR,
          PARAMS
        ),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MCPConnectionError);
    expect((caught as MCPConnectionError).cause).toBeInstanceOf(
      token.ConnectorInstallationRequiredError
    );
    expect(getConsentChallenge(caught)).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });
  it("type: 'sse' => transport consent: the consent URL still surfaces via the SSE 401 path, exactly one authorize call, no retry loop", async () => {
    vi.spyOn(token, 'getTokenResponse').mockRejectedValue(
      new UserAuthorizationRequiredError('user must authorize')
    );
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: CONSENT_URL,
    });
    const SSE_URL = 'https://mcp.example.com/sse';
    const server = mockServer(SSE_URL);

    let caught: unknown;
    try {
      await createMCPClient({
        transport: connectMCPTransport(
          { type: 'sse', url: SSE_URL, fetch: server.fetch },
          CONNECTOR,
          PARAMS
        ),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MCPConnectionError);
    expect(getConsentChallenge(caught)?.url).toBe(CONSENT_URL);
    expect(server.tokenRequests).toBe(0);
    expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);

    // The EventSource must have given up (401 is terminal), not be
    // reconnecting: nothing further reaches Connect or the server.
    const requestsAfterReject = server.requests.length;
    const tokenCalls = vi.mocked(token.getTokenResponse).mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(server.requests.length).toBe(requestsAfterReject);
    expect(vi.mocked(token.getTokenResponse).mock.calls.length).toBe(
      tokenCalls
    );
    expect(authorization.startAuthorization).toHaveBeenCalledTimes(1);
  });

  it('never fetches discovery URLs chosen by a malicious server (blind SSRF via WWW-Authenticate)', async () => {
    // Grant exists, so eager mode sends the token; the compromised
    // server 401s anyway and points discovery at private hosts.
    vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
      token: 'connect_access_token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
    });
    vi.spyOn(authorization, 'startAuthorization').mockResolvedValue({
      request: 'req_abc',
      verifier: 'verifier_xyz',
      url: CONSENT_URL,
    });
    const EVIL_URL = 'https://mcp.evil.example/mcp';
    const fetched: string[] = [];
    const maliciousFetch: typeof fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      if (url.startsWith(EVIL_URL)) {
        return new Response('nope', {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer resource_metadata="http://169.254.169.254/latest/.well-known/oauth-protected-resource"',
          },
        });
      }
      // Internal hosts answer with plausible metadata so a leak would
      // be observable as further requests rather than an early error.
      return new Response(
        JSON.stringify({
          resource: EVIL_URL,
          authorization_servers: ['http://10.0.0.5:8500'],
          issuer: 'http://10.0.0.5:8500',
          authorization_endpoint: 'http://10.0.0.5:8500/a',
          token_endpoint: 'http://10.0.0.5:8500/t',
          response_types_supported: ['code'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    let caught: unknown;
    try {
      await createMCPClient({
        transport: connectMCPTransport(
          { type: 'http', url: EVIL_URL, fetch: maliciousFetch },
          CONNECTOR,
          PARAMS
        ),
      });
    } catch (err) {
      caught = err;
    }

    // Consent still surfaces through the 401 path...
    expect(caught).toBeInstanceOf(MCPConnectionError);
    expect(getConsentChallenge(caught)?.url).toBe(CONSENT_URL);
    // ...and the only host contacted is the configured MCP server.
    expect(fetched.every(url => url.startsWith(EVIL_URL))).toBe(true);
    expect(fetched.some(url => url.includes('169.254.169.254'))).toBe(false);
    expect(fetched.some(url => url.includes('10.0.0.5'))).toBe(false);
  });

  describe('HTTP redirects from the MCP server (real local servers)', () => {
    interface Hit {
      method: string | undefined;
      url: string | undefined;
      authorization: string | undefined;
    }
    const servers: http.Server[] = [];
    const listen = (handler: http.RequestListener): Promise<string> =>
      new Promise(resolve => {
        const server = http.createServer(handler);
        servers.push(server);
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as AddressInfo;
          resolve(`http://127.0.0.1:${port}`);
        });
      });

    afterEach(async () => {
      await Promise.all(
        servers
          .splice(0)
          .map(
            server =>
              new Promise<void>(resolve => server.close(() => resolve()))
          )
      );
    });

    async function malicious303(): Promise<{
      evilUrl: string;
      internalHits: Hit[];
      readonly evilHits: number;
    }> {
      const internalHits: Hit[] = [];
      const counters = { evilHits: 0 };
      const internalUrl = await listen((req, res) => {
        internalHits.push({
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization,
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
      const evilOrigin = await listen((_req, res) => {
        counters.evilHits++;
        res.writeHead(303, { Location: `${internalUrl}/latest/meta-data/` });
        res.end();
      });
      return {
        evilUrl: `${evilOrigin}/mcp`,
        internalHits,
        get evilHits() {
          return counters.evilHits;
        },
      };
    }

    it('refuses to follow a redirect by default, so no request reaches the redirect target', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'connect_access_token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });
      const { evilUrl, internalHits } = await malicious303();

      let caught: unknown;
      try {
        await createMCPClient({
          transport: connectMCPTransport(
            { type: 'http', url: evilUrl },
            CONNECTOR,
            PARAMS
          ),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MCPConnectionError);
      expect(internalHits).toEqual([]);
    });

    it('sse: a redirect fails the connection once and does not leave the EventSource reconnecting', async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'connect_access_token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });
      // Not destructured: `evilHits` is a live getter.
      const servers = await malicious303();

      let caught: unknown;
      try {
        await createMCPClient({
          transport: connectMCPTransport(
            { type: 'sse', url: servers.evilUrl },
            CONNECTOR,
            PARAMS
          ),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(MCPConnectionError);
      expect(servers.internalHits).toEqual([]);
      expect(servers.evilHits).toBe(1);

      // The SDK's EventSource reconnects every 3s after a fetch
      // *rejection*; a terminal non-200 response must not. Wait past
      // one reconnect interval and confirm nothing else was sent.
      await new Promise(resolve => setTimeout(resolve, 3500));
      expect(servers.evilHits).toBe(1);
      expect(servers.internalHits).toEqual([]);
    }, 10_000);

    it("redirect: 'follow' restores native behavior (documented opt-out)", async () => {
      vi.spyOn(token, 'getTokenResponse').mockResolvedValue({
        token: 'connect_access_token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        connector: { id: 'scl_abc', uid: CONNECTOR, type: 'oauth' },
      });
      const { evilUrl, internalHits } = await malicious303();

      let caught: unknown;
      try {
        await createMCPClient({
          transport: connectMCPTransport(
            { type: 'http', url: evilUrl },
            CONNECTOR,
            PARAMS,
            { redirect: 'follow' }
          ),
        });
      } catch (err) {
        caught = err;
      }

      // The redirect was followed as a credential-less GET (the Fetch
      // spec strips Authorization across origins), which is exactly the
      // blind request the default policy prevents.
      expect(caught).toBeInstanceOf(MCPConnectionError);
      expect(internalHits).toEqual([
        {
          method: 'GET',
          url: '/latest/meta-data/',
          authorization: undefined,
        },
      ]);
    });
  });

  it('createMCPClients pools accept one Connect transport per connector and prefix tools by key', async () => {
    vi.spyOn(token, 'getTokenResponse').mockImplementation(async connector => ({
      token: `token_for_${connector}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      connector: { id: 'scl', uid: connector, type: 'oauth' },
    }));
    const GITHUB_URL = 'https://mcp.github.example.com/mcp';
    const linearServer = mockServer(MCP_URL);
    const githubServer = mockServer(GITHUB_URL);

    const pool = await createMCPClients({
      linear: {
        transport: connectMCPTransport(
          { type: 'http', url: MCP_URL, fetch: linearServer.fetch },
          'oauth/linear',
          PARAMS
        ),
      },
      github: {
        transport: connectMCPTransport(
          { type: 'http', url: GITHUB_URL, fetch: githubServer.fetch },
          'oauth/github',
          PARAMS
        ),
      },
    });
    try {
      const tools = await pool.tools();
      expect(tools.map(t => t.name).sort()).toEqual([
        'github_create_issue',
        'linear_create_issue',
      ]);
    } finally {
      await pool.close();
    }

    for (const r of linearServer.requests.filter(r =>
      r.url.startsWith(MCP_URL)
    )) {
      expect(r.authorization).toBe('Bearer token_for_oauth/linear');
    }
    for (const r of githubServer.requests.filter(r =>
      r.url.startsWith(GITHUB_URL)
    )) {
      expect(r.authorization).toBe('Bearer token_for_oauth/github');
    }
  });
});
