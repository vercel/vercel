import { randomUUID } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import output from '../../../output-manager';
import { remoteText } from '../../output/remote-text';
import {
  ConnectRequestSchema,
  Protocol,
  TunnelService,
  type ConnectRequest,
  type Open,
} from '../../../runtime-assets/dev-tunnel/lib/tunnel_pb';
import { TunnelError, tunnelErrorRows } from './errors';

/** What each side of a conn may send before the other grants more. */
export const CONN_WINDOW_BYTES = 256 * 1024;
/** Per Data frame. */
const MAX_PAYLOAD_BYTES = 64 * 1024;
/**
 * Lets the service tell this process's reconnect from another `vc dev`, so it
 * can take its own tunnel back while the old stream is still open there.
 */
export const INSTANCE_HEADER = 'x-vercel-dev-tunnel-instance';
/** Inside the 30s the service needs; it drops a client silent for 90s. */
const HEARTBEAT_MS = 15_000;
/** The service heartbeats every 30s; three missed and the stream is dead. */
const SILENT_MS = 90_000;
/** Notices a dead connection, e.g. after sleep, sooner than SILENT_MS. */
const PING_INTERVAL_MS = 10_000;
/** How long startup tries before it says why the tunnel isn't up yet. */
const READY_TIMEOUT_MS = 30_000;
/**
 * The service holds the deployment's requests this long for a client, so a
 * reconnect inside it goes unnoticed and is not worth reporting.
 */
const QUIET_RECONNECT_MS = 5_000;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 5_000;

/** Codes that reconnecting can't fix, and what each means for the tunnel. */
const FATAL = new Map<Code, string>([
  [Code.FailedPrecondition, "The tunnel service can't serve this tunnel."],
  [Code.InvalidArgument, "The tunnel service rejected the tunnel's request."],
  [Code.PermissionDenied, "The tunnel service didn't allow this tunnel."],
  [
    Code.Unimplemented,
    "The tunnel service doesn't support this version of Vercel CLI.",
  ],
]);

/**
 * From renewToken: the tunnel came back with a new server token or relay, which
 * the proxy deployment doesn't have, so it has to be deployed again.
 */
export class TunnelReplacedError extends Error {
  constructor() {
    super('The tunnel was replaced');
    this.name = 'TunnelReplacedError';
  }
}

export interface TunnelOptions {
  /** api-dev-tunnel's URL, from create-session. */
  relayUrl: string;
  /** The client token, from create-session. */
  clientToken: string;
  /**
   * A new client token, from another create-session. Rejects with
   * TunnelReplacedError when the proxy deployment can't use it.
   */
  renewToken: () => Promise<string>;
  /**
   * Origin of the framework dev server, e.g. `http://127.0.0.1:3000`. Conns
   * reach only its port.
   */
  target: string;
}

export interface Tunnel {
  /**
   * Settles once a stream holds the tunnel, however long that takes. Rejects
   * only if the service refuses this client outright, or on close().
   */
  ready: Promise<void>;
  /** Resolves on close(), or rejects if the service refuses this client. */
  done: Promise<void>;
  close(): void;
}

type Frame = MessageInitShape<typeof ConnectRequestSchema>;

const HEARTBEAT: Frame = { frame: { case: 'heartbeat', value: {} } };

/** The dev server's port, the only one conns may reach. */
export function targetPort(target: string): number {
  const { port, protocol } = new URL(target);
  return Number(port) || (protocol === 'https:' ? 443 : 80);
}

/** Frames for the service, in order, as fast as the stream takes them. */
class Outbox implements AsyncIterable<ConnectRequest> {
  private readonly frames: ConnectRequest[] = [];
  private closed = false;
  private wake = () => {};

  push(frame: Frame) {
    if (this.closed) return;
    this.frames.push(create(ConnectRequestSchema, frame));
    this.wake();
  }

  close() {
    this.closed = true;
    this.wake();
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      const frame = this.frames.shift();
      if (frame) {
        yield frame;
      } else if (this.closed) {
        return;
      } else {
        await new Promise<void>(resolve => {
          this.wake = resolve;
        });
      }
    }
  }
}

/**
 * One conn the service opened: a connection to the dev server.
 *
 * Each direction moves only as fast as its reader takes it. What the dev
 * server sends waits on the service's window, and the service gets window back
 * as what it sent is written to the dev server. Either side may half-close;
 * the conn is over once both have, or either resets.
 */
class Conn {
  private sendWindow = CONN_WINDOW_BYTES;
  private readonly unsent: Buffer[] = [];
  private devEnded = false;
  private closeSent = false;
  private closeReceived = false;
  private over = false;

  constructor(
    private readonly id: bigint,
    private readonly socket: Socket,
    private readonly send: (frame: Frame) => void,
    private readonly forget: () => void
  ) {
    socket.on('data', chunk => {
      this.unsent.push(chunk);
      this.flush();
    });
    socket.on('end', () => {
      this.devEnded = true;
      this.flush();
    });
    socket.on('error', err => this.reset(err.message));
  }

  /** Payload from the deployment. */
  data(payload: Uint8Array) {
    this.socket.write(payload, err => {
      if (!err) this.grant(payload.length);
    });
  }

  /** The deployment has nothing more to send. */
  close() {
    this.closeReceived = true;
    this.socket.end();
    this.finishIfDone();
  }

  /** The service may take this many more bytes. */
  window(bytes: number) {
    this.sendWindow += bytes;
    this.flush();
  }

  /** The service or the stream gave up on the conn. */
  abandon() {
    this.end();
    this.socket.destroy();
  }

  private grant(bytes: number) {
    if (this.over) return;
    this.send({ frame: { case: 'window', value: { connId: this.id, bytes } } });
  }

  private flush() {
    while (this.unsent.length && this.sendWindow > 0) {
      const chunk = this.unsent[0];
      const size = Math.min(chunk.length, this.sendWindow, MAX_PAYLOAD_BYTES);
      const payload = new Uint8Array(chunk.buffer, chunk.byteOffset, size);
      this.send({
        frame: { case: 'data', value: { connId: this.id, payload } },
      });
      this.sendWindow -= size;
      if (size === chunk.length) this.unsent.shift();
      else this.unsent[0] = chunk.subarray(size);
    }
    // Sending past the window would reset the conn, so the dev server waits.
    if (this.unsent.length) this.socket.pause();
    else this.socket.resume();

    if (this.devEnded && !this.unsent.length && !this.closeSent) {
      this.closeSent = true;
      this.send({ frame: { case: 'close', value: { connId: this.id } } });
      this.finishIfDone();
    }
  }

  private reset(reason: string) {
    if (this.over) return;
    this.send({ frame: { case: 'reset', value: { connId: this.id, reason } } });
    this.abandon();
  }

  private finishIfDone() {
    if (this.closeSent && this.closeReceived) this.end();
  }

  private end() {
    if (this.over) return;
    this.over = true;
    this.forget();
  }
}

/**
 * Hold the tunnel's stream to api-dev-tunnel and connect each conn it opens to
 * the dev server, until `close()` is called.
 *
 * A stream that drops is replaced, for as long as it takes: the service's pods
 * roll often. The same instance takes the tunnel back even while the old
 * stream is still open on the service, a refused token is renewed, and a
 * stream the service says to move off keeps its open conns while the next one
 * opens.
 */
export function connectTunnel(options: TunnelOptions): Tunnel {
  const { relayUrl, renewToken, target } = options;
  const local = new URL(target);
  // URL keeps IPv6 brackets; the socket wants the bare address.
  const host = local.hostname.replace(/^\[(.*)\]$/, '$1');
  const port = targetPort(target);
  const client = createClient(
    TunnelService,
    createGrpcTransport({ baseUrl: relayUrl, pingIntervalMs: PING_INTERVAL_MS })
  );
  const instance = randomUUID();

  let closed = false;
  // Every open stream: the current one, and any the service is finishing after
  // telling this process to reconnect.
  const streams = new Set<AbortController>();
  let settleReady:
    | { resolve: () => void; reject: (err: Error) => void }
    | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    settleReady = { resolve, reject };
  });
  ready.catch(() => {});
  let lastFailure: Error | undefined;
  let stopped: Error | undefined;
  let wakeRetry = () => {};
  const stop = (err: Error) => {
    stopped ??= err;
    closed = true;
    for (const stream of streams) stream.abort();
    wakeRetry();
    settleReady?.reject(err);
    settleReady = undefined;
  };
  // Startup keeps retrying too, so say why the tunnel isn't up yet rather than
  // sit silent.
  const readyTimer = setTimeout(() => {
    output.warning(
      [
        "The tunnel hasn't connected yet. Still trying.",
        `Relay: ${remoteText(relayUrl)}`,
        ...(lastFailure ? tunnelErrorRows(lastFailure) : []),
      ].join('\n')
    );
  }, READY_TIMEOUT_MS);
  readyTimer.unref?.();

  // Warns when no stream holds the tunnel for long enough to fail requests.
  let liveStreams = 0;
  let outage: NodeJS.Timeout | undefined;
  let warned = false;
  const onLive = () => {
    liveStreams += 1;
    clearTimeout(readyTimer);
    settleReady?.resolve();
    settleReady = undefined;
    clearTimeout(outage);
    outage = undefined;
    if (warned) output.print('  Tunnel reconnected\n');
    warned = false;
  };
  const onLost = () => {
    liveStreams -= 1;
    if (liveStreams > 0 || closed) return;
    outage ??= setTimeout(() => {
      warned = true;
      output.warning('Tunnel connection lost, reconnecting');
    }, QUIET_RECONNECT_MS);
  };

  const open = (
    { connId, protocol, port: wanted }: Open,
    send: (frame: Frame) => void,
    conns: Map<bigint, Conn>
  ) => {
    if (protocol !== Protocol.TCP || wanted !== port) {
      send({
        frame: {
          case: 'reset',
          value: { connId, reason: `vc dev serves only port ${port}` },
        },
      });
      return;
    }
    const socket = netConnect({ host, port, allowHalfOpen: true });
    conns.set(
      connId,
      new Conn(connId, socket, send, () => conns.delete(connId))
    );
  };

  // Resolves when the service ends the stream. Calls live once it holds the
  // tunnel, and moving once the service says to reconnect elsewhere.
  const stream = async (
    token: string,
    live: () => void,
    moving: () => void
  ) => {
    const controller = new AbortController();
    streams.add(controller);
    let holding = false;
    const outbox = new Outbox();
    const send = (frame: Frame) => outbox.push(frame);
    const conns = new Map<bigint, Conn>();
    let lastHeard = performance.now();
    // The call starts with its first message.
    send(HEARTBEAT);
    const heartbeat = setInterval(() => {
      if (performance.now() - lastHeard > SILENT_MS) controller.abort();
      else send(HEARTBEAT);
    }, HEARTBEAT_MS);

    try {
      const frames = client.connect(outbox, {
        headers: {
          authorization: `Bearer ${token}`,
          [INSTANCE_HEADER]: instance,
        },
        signal: controller.signal,
      });
      for await (const { frame } of frames) {
        lastHeard = performance.now();
        switch (frame.case) {
          case 'heartbeat':
            if (!holding) {
              holding = true;
              onLive();
              live();
            }
            break;
          case 'reconnect':
            moving();
            break;
          case 'open':
            open(frame.value, send, conns);
            break;
          case 'data':
            conns.get(frame.value.connId)?.data(frame.value.payload);
            break;
          case 'close':
            conns.get(frame.value.connId)?.close();
            break;
          case 'reset':
            conns.get(frame.value.connId)?.abandon();
            break;
          case 'window':
            conns.get(frame.value.connId)?.window(frame.value.bytes);
            break;
          default:
            break;
        }
      }
    } finally {
      clearInterval(heartbeat);
      outbox.close();
      // The service ends every conn with the stream.
      for (const conn of [...conns.values()]) conn.abandon();
      streams.delete(controller);
      if (holding) onLost();
    }
  };

  const run = async () => {
    let token = options.clientToken;
    let delay = RETRY_MIN_MS;
    let waitingForOther = false;
    while (!closed) {
      let moving = () => {};
      const moved = new Promise<'moved'>(resolve => {
        moving = () => resolve('moved');
      });
      const ended = stream(
        token,
        () => {
          delay = RETRY_MIN_MS;
          waitingForOther = false;
        },
        moving
      ).then(
        () => undefined,
        (err: unknown) => ConnectError.from(err)
      );
      const outcome = await Promise.race([ended, moved]);
      if (closed) break;
      // The pod is shutting down: this stream finishes its open conns while
      // the next one takes the tunnel elsewhere.
      if (outcome === 'moved') continue;

      const code = outcome?.code;
      const refused = code === undefined ? undefined : FATAL.get(code);
      if (refused) {
        const message = outcome?.rawMessage;
        throw new TunnelError(refused, {
          ...(message && { remote: { source: 'Tunnel service', message } }),
        });
      }
      lastFailure = outcome;
      if (code === Code.AlreadyExists && !waitingForOther) {
        waitingForOther = true;
        output.warning(
          'Another `vc dev --tunnel` holds this tunnel. Waiting for it to stop; one that lost its connection lets go within 90s.'
        );
      }
      output.debug(
        `Tunnel stream ended (${outcome?.message ?? 'by the service'}), reconnecting in ${delay}ms`
      );
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, delay);
        wakeRetry = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      delay = Math.min(delay * 2, RETRY_MAX_MS);
      // Each create-session replaces the client token, e.g. another run.
      if (code === Code.Unauthenticated && !closed) {
        try {
          token = await renewToken();
        } catch (err) {
          if (err instanceof TunnelReplacedError) throw err;
          lastFailure = err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    if (stopped) throw stopped;
  };

  const done = run().then(
    () => clearTimeout(outage),
    (err: unknown) => {
      clearTimeout(outage);
      const error = err instanceof Error ? err : new Error(String(err));
      stop(error);
      throw error;
    }
  );
  done.catch(() => {});

  return {
    ready,
    done,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(readyTimer);
      for (const stream of streams) stream.abort();
      wakeRetry();
      settleReady?.reject(new Error('Tunnel closed'));
      settleReady = undefined;
    },
  };
}
