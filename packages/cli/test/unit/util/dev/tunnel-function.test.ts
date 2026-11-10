import { once } from 'node:events';
import {
  createServer,
  request,
  ServerResponse,
  type IncomingMessage,
  type OutgoingHttpHeaders,
} from 'node:http';
import { createServer as createH2Server } from 'node:http2';
import { connect as netConnect, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  Code,
  ConnectError,
  type ConnectRouter,
  type HandlerContext,
} from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import WebSocket, { WebSocketServer } from 'ws';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  PORT_ENV,
  RELAY_URL_ENV,
  ROUTED_HEADER,
  ROUTED_PATH_PARAM,
  SERVER_TOKEN_ENV,
} from '../../../../src/runtime-assets/dev-tunnel/lib/env';
import {
  TunnelService,
  type DialRequest,
} from '../../../../src/runtime-assets/dev-tunnel/lib/tunnel_pb';

// The upgrade the function is answering, which the runtime would hand it.
const upgrading = vi.hoisted(() => ({
  current: undefined as
    | { req: IncomingMessage; socket: Duplex; head: Buffer }
    | undefined,
  // Makes the next upgrade fail, as a runtime's can.
  fail: false,
}));

vi.mock('@vercel/functions', async () => {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true });
  return {
    experimental_upgradeWebSocket: async (handler: (ws: WebSocket) => void) => {
      if (upgrading.fail) throw new Error('upgrade failed');
      const { req, socket, head } = upgrading.current!;
      handler(
        await new Promise<WebSocket>(resolve =>
          wss.handleUpgrade(req, socket, head, resolve)
        )
      );
      return new Response(null, { status: 204 });
    },
  };
});

const closers: (() => void)[] = [];
afterAll(() => closers.forEach(close => close()));

async function listen(server: {
  listen(port: number, host: string): unknown;
  address(): unknown;
  once(event: string, listener: () => void): unknown;
}) {
  server.listen(0, '127.0.0.1');
  await once(server as never, 'listening');
  return (server.address() as AddressInfo).port;
}

// What the dev server saw of each request.
interface Seen {
  method?: string;
  url?: string;
  host?: string;
  origin?: string;
  routed?: string | string[];
  body: string;
}

let devPort = 0;
let functionPort = 0;
const dials: { token: string | null; port: number }[] = [];
// Set by a test to fail the next Dials as the service would.
let refuse: ConnectError | undefined;
let wsSeen: { host?: string; origin?: string } = {};
// Called when the dev server's side of a WebSocket closes.
let devSocketClosed: (() => void) | undefined;

beforeAll(async () => {
  // The developer's dev server.
  const dev = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const seen: Seen = {
        method: req.method,
        url: req.url,
        host: req.headers.host,
        origin: req.headers.origin,
        routed: req.headers[ROUTED_HEADER],
        body,
      };
      res.setHeader('set-cookie', ['a=1', 'b=2']);
      res.statusCode = req.url === '/missing' ? 404 : 200;
      res.end(JSON.stringify(seen));
    });
  });
  const devSockets = new WebSocketServer({
    server: dev,
    // Not the first one offered, which is what the browser's side would take.
    handleProtocols: offered => (offered.has('chosen') ? 'chosen' : false),
  });
  devSockets.on('connection', (ws, req) => {
    ws.on('close', () => devSocketClosed?.());
    if (req.url === '/closes-first') {
      ws.close();
      return;
    }
    wsSeen = { host: req.headers.host, origin: req.headers.origin };
    // Speaks first, as Next's HMR does.
    ws.send('hello');
    ws.on('message', message => ws.send(message.toString().toUpperCase()));
  });
  devPort = await listen(dev);
  closers.push(() => dev.close());

  // api-dev-tunnel and the CLI together: each Dial reaches the dev server.
  const routes = (router: ConnectRouter) =>
    router.service(TunnelService, {
      async *dial(requests: AsyncIterable<DialRequest>, ctx: HandlerContext) {
        const iterator = requests[Symbol.asyncIterator]();
        const first = await iterator.next();
        const target = first.value?.frame;
        if (target?.case !== 'target') throw new Error('no target');
        dials.push({
          token: ctx.requestHeader.get('authorization'),
          port: target.value.port,
        });
        if (refuse) throw refuse;

        const socket: Socket = netConnect({
          host: '127.0.0.1',
          port: target.value.port,
          allowHalfOpen: true,
        });
        const sent = (async () => {
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            if (next.value.frame.case === 'payload') {
              socket.write(next.value.frame.value);
            }
          }
          socket.end();
        })();
        // The deployment may abandon the call before its side is done.
        sent.catch(() => socket.destroy());
        for await (const chunk of socket) {
          yield {
            frame: { case: 'payload', value: new Uint8Array(chunk as Buffer) },
          };
        }
        yield { frame: { case: 'end', value: {} } };
        await sent;
      },
    });
  const relay = createH2Server(connectNodeAdapter({ routes }));
  const relayPort = await listen(relay);
  const sessions = new Set<{ destroy(): void }>();
  relay.on('session', session => sessions.add(session));
  closers.push(() => {
    sessions.forEach(s => s.destroy());
    relay.close();
  });

  process.env[RELAY_URL_ENV] = `http://127.0.0.1:${relayPort}`;
  process.env[SERVER_TOKEN_ENV] = 'server-token';
  process.env[PORT_ENV] = String(devPort);
  const { default: handler } = await import(
    '../../../../src/runtime-assets/dev-tunnel/api/tunnel'
  );

  // The deployment.
  const fn = createServer((req, res) => void handler(req, res));
  fn.on('upgrade', (req, socket, head) => {
    upgrading.current = { req, socket, head };
    const res = new ServerResponse(req);
    res.assignSocket(socket as Socket);
    // As a runtime would.
    handler(req, res).catch(() => socket.destroy());
  });
  functionPort = await listen(fn);
  closers.push(() => fn.close());
});

beforeEach(() => {
  refuse = undefined;
  dials.length = 0;
  upgrading.fail = false;
  devSocketClosed = undefined;
});

// What the deployment's last route adds to the request it routes.
const routed = { [ROUTED_HEADER]: '1' };

function send(
  path: string,
  {
    method = 'GET',
    headers = {},
    body,
  }: {
    method?: string;
    headers?: OutgoingHttpHeaders;
    body?: string;
  } = {}
) {
  return new Promise<{ status?: number; res: IncomingMessage; body: string }>(
    (resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port: functionPort, path, method, headers },
        res => {
          let text = '';
          res.on('data', chunk => {
            text += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, res, body: text })
          );
        }
      );
      req.on('error', reject);
      req.end(body);
    }
  );
}

const TUNNEL = 'tunnel-abc.vercel.app';

describe('the tunnel deployment', () => {
  it('sends a request to the dev server over a Dial and relays its response', async () => {
    const { status, res, body } = await send('/api/echo?x=1', {
      method: 'POST',
      headers: { 'x-forwarded-host': TUNNEL, 'content-type': 'text/plain' },
      body: 'payload',
    });

    expect(status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['a=1', 'b=2']);
    expect(JSON.parse(body)).toEqual({
      method: 'POST',
      url: '/api/echo?x=1',
      host: TUNNEL,
      body: 'payload',
    });
    expect(dials).toEqual([{ token: 'Bearer server-token', port: devPort }]);
  });

  it('keeps a //host path on the dev server', async () => {
    const { body } = await send('//169.254.169.254/latest/meta-data');
    expect(JSON.parse(body).url).toBe('//169.254.169.254/latest/meta-data');
    expect(dials).toEqual([{ token: 'Bearer server-token', port: devPort }]);
  });

  it("sends the path the project's routes left, with the rest of the query", async () => {
    // `/old/a?q=1`, rewritten by the project to `/new/a?added=1`.
    const { body } = await send(
      `/old/a?q=1&added=1&${ROUTED_PATH_PARAM}=%2Fnew%2Fa`,
      { headers: routed }
    );
    expect(JSON.parse(body)).toMatchObject({ url: '/new/a?q=1&added=1' });
    // The marker is the deployment's, not the app's.
    expect(JSON.parse(body).routed).toBeUndefined();
  });

  it('takes the routed path the deployment added over one the browser sent', async () => {
    const { body } = await send(
      `/a?${ROUTED_PATH_PARAM}=%2Fspoofed&${ROUTED_PATH_PARAM}=%2Fa`,
      { headers: routed }
    );
    expect(JSON.parse(body).url).toBe('/a');
  });

  it('keeps the path of a request that reached the function directly', async () => {
    const { body } = await send('/api/tunnel?x=1');
    expect(JSON.parse(body).url).toBe('/api/tunnel?x=1');
  });

  it("ignores a routed path on a request the deployment didn't route", async () => {
    // Straight to the function, so none of the project's routes ran.
    const path = `/api/tunnel?${ROUTED_PATH_PARAM}=%2Fadmin`;
    const { body } = await send(path);
    expect(JSON.parse(body).url).toBe(path);
  });

  it('refuses an absolute-form request target', async () => {
    const socket = netConnect({ host: '127.0.0.1', port: functionPort });
    socket.end(
      'GET http://169.254.169.254/latest HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'
    );
    let reply = '';
    for await (const chunk of socket) reply += chunk;
    expect(reply).toMatch(/^HTTP\/1\.1 400 /);
    expect(dials).toEqual([]);
  });

  it("passes the dev server's status through", async () => {
    expect((await send('/missing')).status).toBe(404);
  });

  it("shows Next's dev resources the local origin, only from the tunnel", async () => {
    const seen = async (path: string, origin: string) =>
      JSON.parse(
        (await send(path, { headers: { 'x-forwarded-host': TUNNEL, origin } }))
          .body
      ).origin;

    expect(await seen('/_next/static/x.js', `https://${TUNNEL}`)).toBe(
      `http://localhost:${devPort}`
    );
    expect(await seen('/_next/static/x.js', 'https://elsewhere.example')).toBe(
      'https://elsewhere.example'
    );
    expect(await seen('/action', `https://${TUNNEL}`)).toBe(
      `https://${TUNNEL}`
    );
  });

  it('answers 503 with the reason when no vc dev is connected', async () => {
    refuse = new ConnectError(
      'no vc dev is connected to this tunnel',
      Code.Unavailable
    );
    const { status, body } = await send('/');
    expect(status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      error: 'no vc dev is connected to this tunnel',
    });
  });

  it('answers 502 when the developer side resets the conn', async () => {
    refuse = new ConnectError('connect ECONNREFUSED', Code.Aborted);
    const { status, body } = await send('/');
    expect(status).toBe(502);
    expect(JSON.parse(body)).toEqual({ error: 'connect ECONNREFUSED' });
  });

  it('relays a WebSocket, holding what the dev server says first', async () => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${functionPort}/_next/webpack-hmr`,
      {
        headers: { 'x-forwarded-host': TUNNEL, origin: `https://${TUNNEL}` },
      }
    );
    const messages: string[] = [];
    ws.on('message', message => messages.push(message.toString()));
    await once(ws, 'open');
    ws.send('ping');
    await vi.waitFor(() => expect(messages).toEqual(['hello', 'PING']));
    expect(wsSeen).toEqual({
      host: TUNNEL,
      origin: `http://localhost:${devPort}`,
    });
    ws.close();
    await once(ws, 'close');
  });

  it('gives the browser the subprotocol the dev server chose', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${functionPort}/socket`, [
      'first',
      'chosen',
    ]);
    await once(ws, 'open');
    expect(ws.protocol).toBe('chosen');
    ws.close();
    await once(ws, 'close');
  });

  it('fails the handshake when the dev server chooses none of the subprotocols', async () => {
    // As it would straight to the dev server, rather than settle on one.
    const ws = new WebSocket(`ws://127.0.0.1:${functionPort}/socket`, [
      'first',
    ]);
    ws.on('open', () => expect.fail('opened without a subprotocol'));

    await once(ws, 'error');
  });

  it("closes the browser's socket when the dev server's closes before it's accepted", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${functionPort}/closes-first`);
    ws.on('error', () => {});

    await once(ws, 'close');
  });

  it("ends the dev server's socket when the browser's upgrade fails", async () => {
    upgrading.fail = true;
    const closed = new Promise<void>(resolve => {
      devSocketClosed = resolve;
    });
    const ws = new WebSocket(`ws://127.0.0.1:${functionPort}/socket`);
    ws.on('error', () => {});

    await closed;
    ws.terminate();
  });

  it('refuses a WebSocket the tunnel cannot reach', async () => {
    refuse = new ConnectError('no vc dev', Code.Unavailable);
    const ws = new WebSocket(`ws://127.0.0.1:${functionPort}/socket`);
    // Raised by terminate() on a handshake that never completed.
    ws.on('error', () => {});
    const [, res] = (await once(ws, 'unexpected-response')) as [
      unknown,
      IncomingMessage,
    ];
    expect(res.statusCode).toBe(503);
    ws.terminate();
  });
});
