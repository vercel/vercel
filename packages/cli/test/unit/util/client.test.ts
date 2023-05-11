import { listen } from 'async-listen';
import { createProxy } from 'proxy';
import { ProxyAgent } from 'proxy-agent';
import { client } from '../../mocks/client';

describe('Client', () => {
  describe('fetch()', () => {
    beforeEach(() => {
      delete process.env.HTTPS_PROXY;
    });

    it('should respect the `HTTPS_PROXY` env var', async () => {
      let connectCount = 0;
      const proxy = createProxy();
      const proxyUrl = await listen(proxy);
      proxy.on('connect', () => {
        connectCount++;
      });

      try {
        process.env.HTTPS_PROXY = proxyUrl.href;

        client.agent = new ProxyAgent({ keepAlive: true });

        expect(connectCount).toEqual(0);
        const res = await client.fetch('https://example.com/', { json: false });
        expect(connectCount).toEqual(1);
        expect(res.status).toEqual(200);
      } finally {
        client.agent?.destroy();
        proxy.close();
      }
    });
  });
});
