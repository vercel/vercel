import { beforeEach, describe, expect, it } from 'vitest';
import { listen } from 'async-listen';
import { createProxy } from 'proxy';
import { ProxyAgent } from 'proxy-agent';
import { createServer } from 'http';
import { client } from '../../mocks/client';

describe('Client', () => {
  describe('fetch()', () => {
    beforeEach(() => {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
    });

    it('should respect the `HTTP_PROXY` env var', async () => {
      let connectCount = 0;
      const proxy = createProxy();
      const proxyUrl = await listen(proxy);
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

        client.agent = new ProxyAgent({ keepAlive: true });

        expect(connectCount).toEqual(0);
        const res = await client.fetch(mockServerUrl.href, { json: false });
        expect(connectCount).toEqual(1);
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
