import { request, type OutgoingHttpHeaders, type Server } from 'node:http';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { listen } from 'async-listen';
import type Client from '../../../src/util/client';
import { createProxy } from '../../../src/util/extension/proxy';

describe('extension API proxy', () => {
  const clientFetch = vi.fn();
  const client = {
    fetch: clientFetch,
    apiUrl: 'https://api.vercel.com',
  } as unknown as Client;
  let proxy: Server;
  let proxyUrl: URL;

  // Raw request so the target reaches the proxy without URL normalization
  function rawRequest(
    path: string,
    {
      headers = {},
      method = 'GET',
    }: { headers?: OutgoingHttpHeaders; method?: string } = {}
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: proxyUrl.hostname,
          port: proxyUrl.port,
          path,
          method,
          headers,
        },
        res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  beforeAll(async () => {
    proxy = createProxy(client);
    proxyUrl = await listen(proxy, { host: '127.0.0.1', port: 0 });
  });

  beforeEach(() => {
    clientFetch.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  });

  it.each([
    { method: 'HEAD', status: 200 },
    { method: 'GET', status: 204 },
    { method: 'GET', status: 304 },
  ])('preserves a bodyless $method $status response', async ({
    method,
    status,
  }) => {
    clientFetch.mockResolvedValueOnce(
      new Response(null, {
        status,
        headers: { 'x-upstream-status': String(status) },
      })
    );

    const response = await fetch(proxyUrl, {
      method,
      redirect: 'manual',
    });

    expect(response.status).toBe(status);
    expect(response.headers.get('x-upstream-status')).toBe(String(status));
    expect(await response.text()).toBe('');
    expect(clientFetch).toHaveBeenCalledWith(
      'https://api.vercel.com/',
      expect.objectContaining({
        json: false,
        method,
        redirect: 'manual',
        useCurrentTeam: false,
      })
    );
  });

  it('forwards an API path with its query string', async () => {
    clientFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await fetch(new URL('/v2/user?foo=bar', proxyUrl));

    expect(response.status).toBe(200);
    expect(clientFetch).toHaveBeenCalledWith(
      'https://api.vercel.com/v2/user?foo=bar',
      expect.anything()
    );
  });

  it('keeps encoded slashes on the API origin', async () => {
    clientFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const { status } = await rawRequest('/%2F%2Fattacker.example/capture');

    expect(status).toBe(404);
    expect(clientFetch).toHaveBeenCalledWith(
      'https://api.vercel.com/%2F%2Fattacker.example/capture',
      expect.anything()
    );
  });

  it.each([
    '/.//attacker.example/capture',
    '/./\\attacker.example/capture',
    '/a/..//attacker.example/capture',
    '/%2e//attacker.example/capture',
    '/%2e%2e//attacker.example/capture',
  ])('keeps dot-segment target %s on the API origin', async target => {
    clientFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const { status } = await rawRequest(target);

    expect(status).toBe(404);
    expect(clientFetch).toHaveBeenCalledWith(
      'https://api.vercel.com//attacker.example/capture',
      expect.anything()
    );
  });

  it.each([
    '//attacker.example/capture',
    '//127.0.0.1:8443/capture',
    '/\\attacker.example/capture',
    '/\\/attacker.example/capture',
    'https://attacker.example/capture',
    'http://127.0.0.1:8443/capture',
    '*',
  ])('rejects request target %s that leaves the API origin', async target => {
    const { status } = await rawRequest(target);

    expect(status).toBe(400);
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Origin', headers: { origin: 'https://attacker.example' } },
    { name: 'Origin: null', headers: { origin: 'null' } },
    { name: 'Sec-Fetch-Site', headers: { 'sec-fetch-site': 'cross-site' } },
    { name: 'a rebound Host', headers: { host: 'attacker.example' } },
    { name: 'a localhost Host', headers: { host: 'localhost' } },
  ])('rejects a browser request with $name', async ({ headers }) => {
    const { status } = await rawRequest('/v2/user', {
      method: 'POST',
      headers,
    });

    expect(status).toBe(403);
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it('accepts a Node fetch request, which sends Sec-Fetch-Mode', async () => {
    clientFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await fetch(new URL('/v2/user', proxyUrl), {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(clientFetch).toHaveBeenCalledWith(
      'https://api.vercel.com/v2/user',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
