import { beforeEach, describe, expect, it } from 'vitest';
import { listen } from 'async-listen';
import { createProxy } from 'proxy';
import { createServer } from 'http';
import {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
} from 'undici';
import { client } from '../../mocks/client';

describe('Client', () => {
  describe('fetch()', () => {
    beforeEach(() => {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
    });

    it('should respect the `HTTP_PROXY` env var', async () => {
      let requestCount = 0;
      const proxy = createProxy();
      const proxyUrl = await listen(proxy);

      // For HTTP proxying, listen to 'request' events instead of 'connect'
      proxy.on('request', () => {
        requestCount++;
      });

      // Create a mock HTTP server that returns 200
      const mockServer = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
      const mockServerUrl = await listen(mockServer);

      const originalDispatcher = getGlobalDispatcher();
      try {
        process.env.HTTP_PROXY = proxyUrl.href;
        setGlobalDispatcher(new EnvHttpProxyAgent());

        expect(requestCount).toEqual(0);
        const res = await client.fetch(mockServerUrl.href, { json: false });
        expect(requestCount).toEqual(1);
        expect(res.status).toEqual(200);
      } finally {
        setGlobalDispatcher(originalDispatcher);
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
