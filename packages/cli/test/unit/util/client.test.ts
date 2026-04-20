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
      client.agent?.destroy();
      client.agent = undefined;
      client.reset();
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

      try {
        process.env.HTTP_PROXY = proxyUrl.href;

        client.agent = new ProxyAgent({
          keepAlive: true,
          // Ensure localhost isn't bypassed
          rejectUnauthorized: false,
        });

        expect(requestCount).toEqual(0);
        const res = await client.fetch(mockServerUrl.href, { json: false });
        expect(requestCount).toEqual(1);
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

    it('should return 3xx responses directly when redirect is manual', async () => {
      client.scenario.get('/v1/test-redirect', (_req, res) => {
        res.writeHead(302, { Location: 'https://example.com/target' });
        res.end();
      });

      const res = await client.fetch('/v1/test-redirect', {
        json: false,
        redirect: 'manual',
      });

      expect(res.status).toEqual(302);
      expect(res.headers.get('location')).toEqual('https://example.com/target');
    });

    it('does not overwrite teamId when the request URL already includes it', async () => {
      client.config.currentTeam = 'team_from_config';

      client.scenario.get('/v9/projects', (req, res) => {
        expect(req.query.teamId).toBe('team_explicit');
        res.json({ ok: true });
      });

      await client.fetch('/v9/projects?teamId=team_explicit', { json: false });
    });

    it('should treat 3xx as errors when redirect is not manual', async () => {
      // When redirect is not set to 'manual', node-fetch follows the
      // redirect by default. If the redirect target doesn't exist, the
      // fetch will fail. This test verifies the default behavior is
      // unchanged — 3xx without redirect:'manual' doesn't return the
      // raw response.
      client.scenario.get('/v1/test-redirect-default', (_req, res) => {
        // Redirect to the same mock server's /v1/test-redirect-target
        res.writeHead(302, {
          Location: `${client.apiUrl}/v1/test-redirect-target`,
        });
        res.end();
      });
      client.scenario.get('/v1/test-redirect-target', (_req, res) => {
        res.json({ followed: true });
      });

      // Without redirect:'manual', node-fetch follows the redirect and
      // we get the target response (200 JSON)
      const data = (await client.fetch('/v1/test-redirect-default')) as {
        followed: boolean;
      };
      expect(data.followed).toEqual(true);
    });
  });
});
