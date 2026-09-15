import { createServer, type IncomingMessage, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { once } from 'node:events';
import { describe, it, expect, afterEach } from 'vitest';
import {
  createDevProxyServer,
  findFreePort,
  normalizeServiceRoutePrefix,
  resolveServiceRoutePrefix,
  rewriteRequestUrl,
  sanitizeHeaders,
  stripServiceRoutePrefix,
} from '../../src/dev-proxy';

describe('normalizeServiceRoutePrefix', () => {
  it.each([
    ['', ''],
    [undefined, ''],
    ['/', ''],
    ['///', ''],
    ['api', '/api'],
    ['/api', '/api'],
    ['/api/', '/api'],
    ['  /api//  ', '/api'],
    ['/api/v1/', '/api/v1'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeServiceRoutePrefix(input as string | undefined)).toBe(
      expected
    );
  });
});

describe('resolveServiceRoutePrefix', () => {
  it('returns empty when stripping is not enabled', () => {
    expect(
      resolveServiceRoutePrefix({ VERCEL_SERVICE_ROUTE_PREFIX: '/api' })
    ).toBe('');
  });

  it.each([
    '1',
    'true',
    'TRUE',
    ' true ',
  ])('resolves the prefix when strip is %j', strip => {
    expect(
      resolveServiceRoutePrefix({
        VERCEL_SERVICE_ROUTE_PREFIX_STRIP: strip,
        VERCEL_SERVICE_ROUTE_PREFIX: '/api',
      })
    ).toBe('/api');
  });

  it('ignores other truthy-looking values', () => {
    expect(
      resolveServiceRoutePrefix({
        VERCEL_SERVICE_ROUTE_PREFIX_STRIP: 'yes',
        VERCEL_SERVICE_ROUTE_PREFIX: '/api',
      })
    ).toBe('');
  });
});

describe('stripServiceRoutePrefix', () => {
  it.each([
    ['/api', '/api', '/'],
    ['/api/', '/api', '/'],
    ['/api/users', '/api', '/users'],
    ['/apifoo', '/api', '/apifoo'],
    ['/other', '/api', '/other'],
    ['/api/users', '', '/api/users'],
    ['', '/api', '/'],
    ['users', '/api', '/users'],
    ['*', '/api', '*'],
  ])('strips %j with prefix %j to %j', (input, prefix, expected) => {
    expect(stripServiceRoutePrefix(input, prefix)).toBe(expected);
  });
});

describe('rewriteRequestUrl', () => {
  it('preserves the query string', () => {
    expect(rewriteRequestUrl('/api/users?limit=2', '/api')).toBe(
      '/users?limit=2'
    );
  });

  it('is a no-op without a prefix', () => {
    expect(rewriteRequestUrl('/api/users?limit=2', '')).toBe(
      '/api/users?limit=2'
    );
  });
});

describe('sanitizeHeaders', () => {
  it('drops internal headers and restores the forwarded host', () => {
    const headers = sanitizeHeaders({
      host: 'localhost:3000',
      'x-forwarded-host': 'example.com',
      'x-vercel-internal-invocation-id': 'abc',
      'X-Vercel-Internal-Request-Id': '42',
      'user-agent': 'vitest',
    });

    expect(headers.host).toBe('example.com');
    expect(headers['user-agent']).toBe('vitest');
    expect(
      Object.keys(headers).some(key =>
        key.toLowerCase().startsWith('x-vercel-internal-')
      )
    ).toBe(false);
  });

  it('keeps the original host when not forwarded', () => {
    expect(sanitizeHeaders({ host: 'localhost:3000' }).host).toBe(
      'localhost:3000'
    );
  });
});

describe('createDevProxyServer', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(
      servers
        .splice(0)
        .map(
          server => new Promise<void>(resolve => server.close(() => resolve()))
        )
    );
  });

  async function listen(server: Server, port?: number): Promise<number> {
    servers.push(server);
    const listenPort = port ?? (await findFreePort());
    await new Promise<void>(resolve =>
      server.listen(listenPort, '127.0.0.1', () => resolve())
    );
    return listenPort;
  }

  async function startTarget(
    handler: (req: IncomingMessage) => {
      status?: number;
      body: string;
      headers?: Record<string, string>;
    }
  ): Promise<number> {
    const target = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const { status = 200, body, headers = {} } = handler(req);
        res.writeHead(status, { 'content-type': 'text/plain', ...headers });
        res.end(body.replace('%BODY%', Buffer.concat(chunks).toString()));
      });
    });
    return listen(target);
  }

  it('answers the ping path without touching the user server', async () => {
    let hits = 0;
    const targetPort = await startTarget(() => {
      hits += 1;
      return { body: 'user' };
    });
    const proxyPort = await listen(createDevProxyServer({ targetPort }));

    const res = await fetch(`http://127.0.0.1:${proxyPort}/_vercel/ping`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(hits).toBe(0);
  });

  it('forwards method, path, body, and response headers', async () => {
    const targetPort = await startTarget(req => ({
      body: `${req.method} ${req.url} %BODY%`,
      headers: { 'x-from-user': 'yes' },
    }));
    const proxyPort = await listen(createDevProxyServer({ targetPort }));

    const res = await fetch(`http://127.0.0.1:${proxyPort}/items?page=2`, {
      method: 'POST',
      body: 'payload',
    });

    expect(res.headers.get('x-from-user')).toBe('yes');
    expect(await res.text()).toBe('POST /items?page=2 payload');
  });

  it('strips the service route prefix', async () => {
    const targetPort = await startTarget(req => ({ body: String(req.url) }));
    const proxyPort = await listen(
      createDevProxyServer({ targetPort, routePrefix: '/api/' })
    );

    const rewritten = await fetch(`http://127.0.0.1:${proxyPort}/api/users`);
    expect(await rewritten.text()).toBe('/users');

    const untouched = await fetch(`http://127.0.0.1:${proxyPort}/healthz`);
    expect(await untouched.text()).toBe('/healthz');
  });

  it('hides internal headers and forwards the original host', async () => {
    const targetPort = await startTarget(req => ({
      body: JSON.stringify({
        host: req.headers.host,
        internal: Object.keys(req.headers).filter(key =>
          key.startsWith('x-vercel-internal-')
        ),
      }),
    }));
    const proxyPort = await listen(createDevProxyServer({ targetPort }));

    const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: {
        'x-forwarded-host': 'example.com',
        'x-vercel-internal-invocation-id': 'abc',
      },
    });

    expect(await res.json()).toEqual({ host: 'example.com', internal: [] });
  });

  it('returns 502 when the user server is unreachable', async () => {
    const targetPort = await findFreePort();
    const proxyPort = await listen(createDevProxyServer({ targetPort }));

    const res = await fetch(`http://127.0.0.1:${proxyPort}/`);
    expect(res.status).toBe(502);
  });

  it('relays protocol upgrades', async () => {
    const target = createServer();
    target.on('upgrade', (req, socket, head) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
          `Connection: Upgrade\r\nX-Upgraded-Path: ${req.url}\r\n\r\n`
      );
      if (head?.length) socket.write(new Uint8Array(head));
      socket.pipe(socket);
    });
    const targetPort = await listen(target);
    const proxyPort = await listen(
      createDevProxyServer({ targetPort, routePrefix: '/api' })
    );

    const client = connect({ host: '127.0.0.1', port: proxyPort });
    sockets.push(client);
    await once(client, 'connect');
    client.write(
      'GET /api/socket HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n' +
        'Connection: Upgrade\r\n\r\n'
    );

    let received = '';
    while (!received.includes('\r\n\r\n')) {
      const [chunk] = await once(client, 'data');
      received += chunk.toString();
    }

    expect(received).toContain('101 Switching Protocols');
    expect(received).toContain('X-Upgraded-Path: /socket');

    client.write('echo');
    const [echoed] = await once(client, 'data');
    expect(echoed.toString()).toBe('echo');
  });
});
