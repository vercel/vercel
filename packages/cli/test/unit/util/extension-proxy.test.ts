import type { Server } from 'node:http';
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
  const client = { fetch: clientFetch } as unknown as Client;
  let proxy: Server;
  let proxyUrl: URL;

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
      '/',
      expect.objectContaining({
        json: false,
        method,
        redirect: 'manual',
        useCurrentTeam: false,
      })
    );
  });
});
