import { beforeEach, describe, expect, it } from 'vitest';
import { listen } from 'async-listen';
import { createProxy } from 'proxy';
import { createServer } from 'http';
import { ProxyAgent } from 'undici';
import { client } from '../../mocks/client';

describe('Client', () => {
  describe('fetch()', () => {
    beforeEach(() => {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
      delete process.env.https_proxy;
      delete process.env.http_proxy;
      delete process.env.NO_PROXY;
      delete process.env.no_proxy;
      client.agent?.destroy();
      client.agent = undefined;
    });

    it('should respect the `HTTP_PROXY` env var', async () => {
      let requestCount = 0;
      let connectCount = 0;
      const proxy = createProxy();
      const proxyUrl = await listen(proxy);

      proxy.on('request', () => {
        requestCount++;
      });
      proxy.on('connect', () => {
        connectCount++;
      });

      // Create a mock HTTP server that returns 200
      const mockServer = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
      const mockServerUrl = await listen(mockServer);

      try {
        process.env.HTTP_PROXY = proxyUrl.href;

        client.agent = new ProxyAgent(process.env.HTTP_PROXY!);

        expect(requestCount + connectCount).toEqual(0);
        const res = await client.fetch(mockServerUrl.href, { json: false });
        expect(requestCount + connectCount).toEqual(1);
        expect(res.status).toEqual(200);
      } finally {
        client.agent?.destroy();
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
