import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { Router } from 'express';
import type { ExpressRouter } from 'express';

export interface FakeApiRequest {
  method: string;
  path: string;
  query: Record<string, unknown>;
  authorization: string | undefined;
  body: unknown;
}

export interface FakeApi {
  origin: string;
  router: ExpressRouter;
  requests: FakeApiRequest[];
  unhandled: FakeApiRequest[];
  close(): Promise<void>;
}

export interface FakeIntrospection {
  active: boolean;
  client_id?: string;
  client_name?: string;
  team?: { id: string; slug?: string; name?: string };
}

/**
 * Starts an isolated loopback API for one scenario. It deliberately does not
 * use `test/mocks/client`, which installs Vitest hooks at import time.
 */
export async function startFakeApi(): Promise<FakeApi> {
  const app = express();
  const router = Router();
  const requests: FakeApiRequest[] = [];
  const unhandled: FakeApiRequest[] = [];
  let expectedHost = '';

  app.use(express.json());
  app.use((req, _res, next) => {
    if (
      !req.headers['content-type']?.startsWith(
        'application/x-www-form-urlencoded'
      )
    ) {
      next?.();
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
    });
    req.on('end', () => {
      req.body = Object.fromEntries(new URLSearchParams(raw));
      next?.();
    });
  });
  app.use((req, res, next) => {
    const request = {
      method: req.method,
      path: req.path,
      query: { ...req.query },
      authorization: req.get('authorization'),
      body: req.body,
    };
    requests.push(request);

    if (req.get('host') !== expectedHost) {
      unhandled.push(request);
      res.status(421).json({
        error: { code: 'scenario_bad_host', message: 'Unexpected Host' },
      });
      return;
    }
    next?.();
  });
  app.use(router);
  app.use((req, res) => {
    const request = requests[requests.length - 1];
    if (request) unhandled.push(request);
    // 404 is not retried by `Client.fetch`, so missing routes fail quickly.
    res.status(404).json({
      error: {
        code: 'scenario_unhandled',
        message: `Scenario API did not handle ${req.method} ${req.path}`,
      },
    });
  });

  const server: Server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  expectedHost = `127.0.0.1:${port}`;

  return {
    origin: `http://${expectedHost}`,
    router,
    requests,
    unhandled,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
}

/** Registers real OAuth discovery and introspection endpoints on the fake API. */
export function registerOAuthRoutes(
  api: FakeApi,
  { token, introspection }: { token: string; introspection: FakeIntrospection }
) {
  api.router.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: `${api.origin}/`,
      device_authorization_endpoint: `${api.origin}/oauth/device`,
      token_endpoint: `${api.origin}/oauth/token`,
      revocation_endpoint: `${api.origin}/oauth/revoke`,
      jwks_uri: `${api.origin}/oauth/jwks`,
      introspection_endpoint: `${api.origin}/oauth/introspect`,
    });
  });

  api.router.post('/oauth/introspect', (req, res) => {
    res.json(req.body?.token === token ? introspection : { active: false });
  });
}
