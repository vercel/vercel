import { once } from 'node:events';
import { createServer as createH2Server } from 'node:http2';
import {
  createServer as createNetServer,
  type AddressInfo,
  type Server,
  type Socket,
} from 'node:net';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  Code,
  ConnectError,
  type ConnectRouter,
  type HandlerContext,
} from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectTunnel,
  CONN_WINDOW_BYTES,
  INSTANCE_HEADER,
  type Tunnel,
  TunnelReplacedError,
  type TunnelOptions,
} from '../../../../src/util/dev/tunnel/client';
import {
  ConnectResponseSchema,
  Protocol,
  TunnelService,
  type ConnectRequest,
} from '../../../../src/runtime-assets/dev-tunnel/lib/tunnel_pb';

type Frame = MessageInitShape<typeof ConnectResponseSchema>;

/** One Connect stream the fake service accepted, played by the test. */
class FakeStream {
  readonly received: ConnectRequest[] = [];
  private readonly outgoing: Frame[] = [];
  // null ends the stream cleanly.
  private ending: ConnectError | null | undefined;
  private wake = () => {};

  constructor(
    readonly token: string | null,
    readonly instance: string | null
  ) {}

  send(frame: Frame) {
    this.outgoing.push(frame);
    this.wake();
  }

  end(err: ConnectError | null = null) {
    this.ending = err;
    this.wake();
  }

  async *messages() {
    for (;;) {
      const frame = this.outgoing.shift();
      if (frame) {
        yield create(ConnectResponseSchema, frame);
      } else if (this.ending !== undefined) {
        if (this.ending) throw this.ending;
        return;
      } else {
        await new Promise<void>(resolve => {
          this.wake = resolve;
        });
      }
    }
  }

  /** What the CLI sent on a conn. */
  conn(connId: bigint) {
    let data = '';
    let granted = 0;
    let closed = false;
    let reset: string | undefined;
    for (const { frame } of this.received) {
      if (frame.case === 'heartbeat' || frame.value?.connId !== connId) {
        continue;
      }
      if (frame.case === 'data') data += Buffer.from(frame.value.payload);
      if (frame.case === 'window') granted += frame.value.bytes;
      if (frame.case === 'close') closed = true;
      if (frame.case === 'reset') reset = frame.value.reason;
    }
    return { data, granted, closed, reset };
  }
}

const servers: { close(): void }[] = [];
const tunnels: Tunnel[] = [];

afterEach(() => {
  for (const tunnel of tunnels.splice(0)) tunnel.close();
  for (const server of servers.splice(0)) server.close();
});

async function listen(server: Server | ReturnType<typeof createH2Server>) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

/**
 * A stand-in for api-dev-tunnel. `accept` may refuse a stream by throwing;
 * otherwise the stream is told it holds the tunnel, as the service does.
 */
async function startService(accept: (stream: FakeStream) => void = () => {}) {
  const streams: FakeStream[] = [];
  const routes = (router: ConnectRouter) =>
    router.service(TunnelService, {
      async *connect(
        requests: AsyncIterable<ConnectRequest>,
        ctx: HandlerContext
      ) {
        const stream = new FakeStream(
          ctx.requestHeader.get('authorization'),
          ctx.requestHeader.get(INSTANCE_HEADER)
        );
        streams.push(stream);
        void (async () => {
          for await (const request of requests) stream.received.push(request);
        })().catch(() => {});
        accept(stream);
        stream.send({ frame: { case: 'heartbeat', value: {} } });
        yield* stream.messages();
      },
    });
  const server = createH2Server(connectNodeAdapter({ routes }));
  // Ends the CLI's stream with the server, as a pod going away would.
  const sessions = new Set<{ destroy(): void }>();
  server.on('session', session => sessions.add(session));
  servers.push({ close: () => sessions.forEach(s => s.destroy()) });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, streams };
}

/** Upper-cases what it gets, and ends once the client does. */
async function startDevServer(serve?: (socket: Socket) => void) {
  const sockets: Socket[] = [];
  const server = createNetServer({ allowHalfOpen: true }, socket => {
    sockets.push(socket);
    if (serve) return serve(socket);
    socket.on('data', chunk => socket.write(chunk.toString().toUpperCase()));
    socket.on('end', () => socket.end());
  });
  servers.push({ close: () => sockets.forEach(s => s.destroy()) });
  return { port: await listen(server), sockets };
}

function connect(
  service: { url: string },
  devPort: number,
  options: Partial<TunnelOptions> = {}
) {
  const tunnel = connectTunnel({
    relayUrl: service.url,
    clientToken: 'client-token',
    renewToken: () => Promise.reject(new Error('unexpected renewal')),
    target: `http://127.0.0.1:${devPort}`,
    ...options,
  });
  tunnels.push(tunnel);
  return tunnel;
}

const open = (connId: bigint, port: number): Frame => ({
  frame: { case: 'open', value: { connId, protocol: Protocol.TCP, port } },
});
const data = (connId: bigint, payload: string | Uint8Array): Frame => ({
  frame: {
    case: 'data',
    value: {
      connId,
      payload:
        typeof payload === 'string'
          ? new TextEncoder().encode(payload)
          : payload,
    },
  },
});
const close = (connId: bigint): Frame => ({
  frame: { case: 'close', value: { connId } },
});
const grant = (connId: bigint, bytes: number): Frame => ({
  frame: { case: 'window', value: { connId, bytes } },
});

describe('connectTunnel', () => {
  it('relays a conn to the dev server both ways and ends it on half-close', async () => {
    const dev = await startDevServer();
    const service = await startService();
    const tunnel = connect(service, dev.port);
    await tunnel.ready;

    const [stream] = service.streams;
    expect(stream.token).toBe('Bearer client-token');
    expect(stream.instance).toMatch(/^[0-9a-f-]{36}$/);

    stream.send(open(1n, dev.port));
    stream.send(data(1n, 'hello'));
    stream.send(close(1n));
    await vi.waitFor(() => expect(stream.conn(1n).closed).toBe(true));
    expect(stream.conn(1n)).toEqual({
      data: 'HELLO',
      granted: 5,
      closed: true,
      reset: undefined,
    });
  });

  it('keeps sending after the deployment half-closes', async () => {
    const dev = await startDevServer(socket => {
      socket.on('end', () => {
        socket.write('late');
        socket.end();
      });
    });
    const service = await startService();
    const tunnel = connect(service, dev.port);
    await tunnel.ready;
    const [stream] = service.streams;

    stream.send(open(1n, dev.port));
    stream.send(close(1n));
    await vi.waitFor(() => expect(stream.conn(1n).closed).toBe(true));
    expect(stream.conn(1n).data).toBe('late');
  });

  it('resets a conn to any port but the dev server', async () => {
    const dev = await startDevServer();
    const service = await startService();
    await connect(service, dev.port).ready;
    const [stream] = service.streams;

    stream.send(open(1n, 22));
    await vi.waitFor(() =>
      expect(stream.conn(1n).reset).toBe(`vc dev serves only port ${dev.port}`)
    );
  });

  it('resets a conn the dev server refuses', async () => {
    const gone = createNetServer();
    const port = await listen(gone);
    gone.close();
    const service = await startService();
    await connect(service, port).ready;
    const [stream] = service.streams;

    stream.send(open(1n, port));
    await vi.waitFor(() =>
      expect(stream.conn(1n).reset).toMatch(/ECONNREFUSED/)
    );
  });

  it("holds the dev server's bytes past the window until the service grants more", async () => {
    const size = CONN_WINDOW_BYTES + 64 * 1024;
    const dev = await startDevServer(socket => {
      socket.end('x'.repeat(size));
    });
    const service = await startService();
    await connect(service, dev.port).ready;
    const [stream] = service.streams;

    stream.send(open(1n, dev.port));
    await vi.waitFor(() =>
      expect(stream.conn(1n).data.length).toBe(CONN_WINDOW_BYTES)
    );
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(stream.conn(1n)).toMatchObject({
      data: 'x'.repeat(CONN_WINDOW_BYTES),
      closed: false,
    });

    stream.send(grant(1n, size - CONN_WINDOW_BYTES));
    await vi.waitFor(() => expect(stream.conn(1n).closed).toBe(true));
    expect(stream.conn(1n).data.length).toBe(size);
  });

  it('grants window back as it writes to the dev server', async () => {
    let taken = 0;
    const dev = await startDevServer(socket =>
      socket.on('data', chunk => {
        taken += chunk.length;
      })
    );
    const service = await startService();
    await connect(service, dev.port).ready;
    const [stream] = service.streams;

    stream.send(open(1n, dev.port));
    for (let i = 0; i < 4; i++) {
      stream.send(data(1n, new Uint8Array(CONN_WINDOW_BYTES / 4)));
    }
    await vi.waitFor(() =>
      expect(stream.conn(1n).granted).toBe(CONN_WINDOW_BYTES)
    );
    expect(taken).toBe(CONN_WINDOW_BYTES);
  });

  it('reconnects with the same instance, and drops the old conns', async () => {
    const dev = await startDevServer(socket => socket.resume());
    const service = await startService();
    await connect(service, dev.port).ready;
    const [first] = service.streams;
    first.send(open(1n, dev.port));
    await vi.waitFor(() => expect(dev.sockets).toHaveLength(1));

    first.end(new ConnectError('the pod is shutting down', Code.Unavailable));
    await vi.waitFor(() => expect(service.streams).toHaveLength(2));
    const [, second] = service.streams;
    expect(second.instance).toBe(first.instance);
    expect(second.token).toBe(first.token);
    await vi.waitFor(() => expect(dev.sockets[0].readableEnded).toBe(true));
  });

  it("opens a new stream when the service says to reconnect, and keeps the old one's conns", async () => {
    const dev = await startDevServer();
    const service = await startService();
    await connect(service, dev.port).ready;
    const [first] = service.streams;
    first.send(open(1n, dev.port));
    await vi.waitFor(() => expect(dev.sockets).toHaveLength(1));

    first.send({ frame: { case: 'reconnect', value: {} } });
    await vi.waitFor(() => expect(service.streams).toHaveLength(2));
    const [, second] = service.streams;
    expect(second.instance).toBe(first.instance);

    first.send(data(1n, 'still here'));
    await vi.waitFor(() => expect(first.conn(1n).data).toBe('STILL HERE'));
    first.end(new ConnectError('taken over', Code.Aborted));
    await vi.waitFor(() => expect(dev.sockets[0].readableEnded).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(service.streams).toHaveLength(2);
  });

  it('renews a refused token', async () => {
    const dev = await startDevServer();
    const service = await startService(stream => {
      if (stream.token !== 'Bearer renewed') {
        throw new ConnectError('stale token', Code.Unauthenticated);
      }
    });
    const renewToken = vi.fn(async () => 'renewed');
    await connect(service, dev.port, { renewToken }).ready;

    expect(renewToken).toHaveBeenCalledTimes(1);
    expect(service.streams.map(s => s.token)).toEqual([
      'Bearer client-token',
      'Bearer renewed',
    ]);
  });

  it('renews again when the renewed token is refused too', async () => {
    const dev = await startDevServer();
    const service = await startService(stream => {
      if (stream.token !== 'Bearer renewed-2') {
        throw new ConnectError('stale token', Code.Unauthenticated);
      }
    });
    let renewals = 0;
    const renewToken = vi.fn(async () => `renewed-${++renewals}`);
    await connect(service, dev.port, { renewToken }).ready;

    expect(renewToken).toHaveBeenCalledTimes(2);
  });

  it('stops when the tunnel was replaced, so the proxy can be deployed again', async () => {
    const dev = await startDevServer();
    const service = await startService(() => {
      throw new ConnectError('stale token', Code.Unauthenticated);
    });
    const tunnel = connect(service, dev.port, {
      renewToken: () => Promise.reject(new TunnelReplacedError()),
    });

    await expect(tunnel.done).rejects.toBeInstanceOf(TunnelReplacedError);
    expect(service.streams).toHaveLength(1);
  });

  it('waits while another vc dev holds the tunnel, then takes it', async () => {
    const dev = await startDevServer();
    let refusals = 2;
    const service = await startService(() => {
      if (refusals-- > 0) {
        throw new ConnectError('another client', Code.AlreadyExists);
      }
    });

    await connect(service, dev.port).ready;
    expect(service.streams).toHaveLength(3);
  });

  it('fails when the service refuses this client outright', async () => {
    const dev = await startDevServer();
    const service = await startService(() => {
      throw new ConnectError('not allowed', Code.PermissionDenied);
    });
    const tunnel = connect(service, dev.port);

    // The service's words are kept apart from the CLI's copy.
    const refused = {
      message: "The tunnel service didn't allow this tunnel.",
      remote: { source: 'Tunnel service', message: 'not allowed' },
    };
    await expect(tunnel.ready).rejects.toMatchObject(refused);
    await expect(tunnel.done).rejects.toMatchObject(refused);
    expect(service.streams).toHaveLength(1);
  });

  it('stops reconnecting once closed', async () => {
    const dev = await startDevServer();
    const service = await startService();
    const tunnel = connect(service, dev.port);
    await tunnel.ready;

    tunnel.close();
    await tunnel.done;
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(service.streams).toHaveLength(1);
  });
});
