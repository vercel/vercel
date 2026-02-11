import { beforeEach, describe, expect, it } from 'vitest';
import { listen } from 'async-listen';
import { createProxy } from 'proxy';
import { createServer } from 'http';
import { EnvHttpProxyAgent } from 'undici';
import { client } from '../../mocks/client';
import type { FetchOptions } from '../../../src/util/client';

describe('Client', () => {
  describe('fetch()', () => {
    beforeEach(() => {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
      client.dispatcher = undefined;
    });

    it('should respect the `HTTP_PROXY` env var', async () => {
      let requestCount = 0;
      const proxy = createProxy();
      const proxyUrl = await listen(proxy);

      // undici uses CONNECT tunneling for all proxied requests (including HTTP)
      proxy.on('connect', () => {
        requestCount++;
      });

      // Create a mock HTTP server that returns 200
      const mockServer = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
      const mockServerUrl = await listen(mockServer);

      try {
        process.env.HTTP_PROXY = proxyUrl.href;
        // Cast needed: undici@6 Dispatcher is structurally compatible with
        // undici-types@5 Dispatcher (from @types/node) but TS can't verify.
        client.dispatcher =
          new EnvHttpProxyAgent() as unknown as FetchOptions['dispatcher'];

        expect(requestCount).toEqual(0);
        const res = await client.fetch(mockServerUrl.href, { json: false });
        expect(requestCount).toEqual(1);
        expect(res.status).toEqual(200);
      } finally {
        client.dispatcher = undefined;
        await new Promise<void>(resolve => {
          proxy.close(() => resolve());
        });
        await new Promise<void>(resolve => {
          mockServer.close(() => resolve());
        });
      }
    });
  });
});
