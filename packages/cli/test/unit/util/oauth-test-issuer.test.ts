import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { introspectToken } from '../../../src/util/introspect-token';
import {
  OAUTH_TEST_ISSUER_ENV,
  as,
  getOAuthTestIssuer,
  inspectTokenRequest,
} from '../../../src/util/oauth';

interface OAuthServer {
  origin: string;
  requests: Array<{ method: string; path: string; body: string }>;
  close(): Promise<void>;
}

const servers: OAuthServer[] = [];
let originalApiUrl: string;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function startOAuthServer(
  metadata: (origin: string) => Record<string, string>
): Promise<OAuthServer> {
  const requests: OAuthServer['requests'] = [];
  let origin = '';
  const server: Server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = req.url ?? '';
    requests.push({ method: req.method ?? '', path, body });

    res.setHeader('content-type', 'application/json');
    if (path === '/.well-known/openid-configuration') {
      res.end(JSON.stringify(metadata(origin)));
      return;
    }
    if (path === '/introspect' && req.method === 'POST') {
      res.end(
        JSON.stringify({
          active: new URLSearchParams(body).get('token') === 'test_token',
          client_id: 'app_local',
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const oauthServer = {
    origin,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      ),
  };
  servers.push(oauthServer);
  return oauthServer;
}

function discoveryMetadata(
  origin: string,
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    issuer: `${origin}/`,
    device_authorization_endpoint: `${origin}/device`,
    token_endpoint: `${origin}/token`,
    revocation_endpoint: `${origin}/revoke`,
    jwks_uri: `${origin}/jwks`,
    introspection_endpoint: `${origin}/introspect`,
    ...overrides,
  };
}

beforeEach(() => {
  originalApiUrl = client.apiUrl;
});

afterEach(async () => {
  client.apiUrl = originalApiUrl;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(server => server.close()));
});

describe('OAuth test issuer', () => {
  it('uses the production issuer by default', async () => {
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json(discoveryMetadata('https://vercel.com'))
      );

    expect(getOAuthTestIssuer()).toBeNull();
    await expect(as()).resolves.toMatchObject({
      issuer: new URL('https://vercel.com/'),
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      'https://vercel.com/.well-known/openid-configuration'
    );
  });

  it('discovers and introspects against a loopback test issuer', async () => {
    const server = await startOAuthServer(origin => discoveryMetadata(origin));
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, server.origin);
    client.apiUrl = server.origin;
    client.authConfig.token = 'test_token';

    await expect(introspectToken(client)).resolves.toEqual({
      active: true,
      client_id: 'app_local',
    });
    expect(server.requests).toEqual([
      {
        method: 'GET',
        path: '/.well-known/openid-configuration',
        body: '',
      },
      { method: 'POST', path: '/introspect', body: 'token=test_token' },
    ]);
  });

  it('rejects an issuer mismatch', async () => {
    const server = await startOAuthServer(origin =>
      discoveryMetadata(origin, { issuer: 'https://vercel.com/' })
    );
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, server.origin);

    await expect(as()).rejects.toThrow('Issuer mismatch');
  });

  it('rejects discovery endpoints outside the test issuer origin', async () => {
    const server = await startOAuthServer(origin =>
      discoveryMetadata(origin, {
        introspection_endpoint: 'https://example.test/introspect',
      })
    );
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, server.origin);

    await expect(inspectTokenRequest('test_token')).rejects.toThrow(
      'OAuth test endpoint must use the test issuer origin'
    );
    expect(server.requests.map(request => request.path)).toEqual([
      '/.well-known/openid-configuration',
    ]);
  });

  it.each([
    'https://127.0.0.1:1234',
    'http://localhost:1234',
    'http://192.168.0.1:1234',
    'http://127.0.0.1',
    'http://127.0.0.1:1234/path',
    'not a url',
  ])('rejects %s before network I/O', async value => {
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, value);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(as()).rejects.toThrow(OAUTH_TEST_ISSUER_ENV);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps custom API origins blocked without test opt-in', async () => {
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, undefined);
    client.apiUrl = 'http://127.0.0.1:1234';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(introspectToken(client)).rejects.toThrow(
      'Token introspection is unavailable for custom API origins'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks an API origin different from the test issuer', async () => {
    vi.stubEnv(OAUTH_TEST_ISSUER_ENV, 'http://127.0.0.1:1234');
    client.apiUrl = 'http://127.0.0.1:4321';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(introspectToken(client)).rejects.toThrow(
      'Token introspection is unavailable for custom API origins'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
