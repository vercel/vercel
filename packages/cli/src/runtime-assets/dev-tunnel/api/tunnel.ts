/**
 * The function behind `vc dev --tunnel`'s deployment. Every request it gets is
 * sent to the developer's dev server over a Dial to api-dev-tunnel, which
 * relays the bytes to the CLI; the CLI connects them to the dev server.
 *
 * Uploaded as source with ../lib and built by @vercel/node, so it imports only
 * what the deployment's package.json lists.
 */
import {
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { experimental_upgradeWebSocket } from '@vercel/functions';
import WebSocket from 'ws';
import {
  PORT_ENV,
  RELAY_URL_ENV,
  ROUTED_HEADER,
  ROUTED_PATH_PARAM,
  SERVER_TOKEN_ENV,
} from '../lib/env';
import {
  DialRequestSchema,
  Protocol,
  TunnelService,
  type DialRequest,
} from '../lib/tunnel_pb';

const PORT = Number(process.env[PORT_ENV]);
const SERVER_TOKEN = process.env[SERVER_TOKEN_ENV] ?? '';
// The dev server as the developer's own browser sees it.
const LOCAL_ORIGIN = `http://localhost:${PORT}`;
// Per Dial message; the service cuts payload to the conn's window anyway.
const MAX_PAYLOAD_BYTES = 64 * 1024;
// ws's own default rather than @vercel/functions' 256 KiB, so the app's
// WebSockets take what they would locally.
const MAX_MESSAGE_BYTES = 100 * 1024 * 1024;

// Module scope: Fluid reuses an instance across invocations, and with it the
// HTTP/2 connection to api-dev-tunnel.
const relay = createClient(
  TunnelService,
  createGrpcTransport({ baseUrl: process.env[RELAY_URL_ENV] ?? '' })
);

/** Headers that describe a hop, not the request. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** Headers the dev server's end of a WebSocket handshake sets itself. */
const WS_HANDSHAKE = new Set([
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
]);

/**
 * A TCP connection to the dev server, over one Dial. Writes go to the dev
 * server and its replies are read. end() half-closes; destroy() abandons the
 * conn, which resets it on the developer's side.
 */
class DialSocket extends Duplex {
  private readonly call = new AbortController();
  // The write waiting for the Dial to take it.
  private waiting?: { chunk: Buffer; done: () => void };
  private writesEnded = false;
  private wakeWriter = () => {};
  private wakeReader = () => {};

  constructor() {
    super({ allowHalfOpen: true });
    void this.pump();
  }

  // The http and ws clients treat this as a net.Socket.
  setNoDelay() {
    return this;
  }

  setKeepAlive() {
    return this;
  }

  setTimeout() {
    return this;
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void) {
    this.waiting = { chunk, done };
    this.wakeWriter();
  }

  _final(done: () => void) {
    this.writesEnded = true;
    this.wakeWriter();
    done();
  }

  _read() {
    this.wakeReader();
  }

  _destroy(err: Error | null, done: (err: Error | null) => void) {
    this.writesEnded = true;
    this.waiting = undefined;
    this.wakeWriter();
    this.call.abort();
    done(err);
  }

  // A write is done once the Dial has taken all of it, which is as fast as
  // the developer's side reads.
  private async *requests(): AsyncGenerator<DialRequest> {
    yield create(DialRequestSchema, {
      frame: { case: 'target', value: { protocol: Protocol.TCP, port: PORT } },
    });
    for (;;) {
      while (!this.waiting && !this.writesEnded) {
        await new Promise<void>(resolve => {
          this.wakeWriter = resolve;
        });
      }
      const write = this.waiting;
      if (!write) return;
      this.waiting = undefined;
      const { buffer, byteOffset, length } = write.chunk;
      for (let i = 0; i < length; i += MAX_PAYLOAD_BYTES) {
        yield create(DialRequestSchema, {
          frame: {
            case: 'payload',
            value: new Uint8Array(
              buffer,
              byteOffset + i,
              Math.min(MAX_PAYLOAD_BYTES, length - i)
            ),
          },
        });
      }
      write.done();
    }
  }

  private async pump() {
    try {
      const responses = relay.dial(this.requests(), {
        headers: { authorization: `Bearer ${SERVER_TOKEN}` },
        signal: this.call.signal,
      });
      for await (const { frame } of responses) {
        if (frame.case === 'end') {
          this.push(null);
        } else if (frame.case === 'payload' && !this.push(frame.value)) {
          await new Promise<void>(resolve => {
            this.wakeReader = resolve;
          });
        }
      }
      this.push(null);
    } catch (err) {
      this.destroy(ConnectError.from(err));
    }
  }
}

const dial = () => new DialSocket() as unknown as Socket;

/**
 * The Host the browser used, which is what the app should see.
 *
 * Apps build absolute URLs from it — redirects, cookie domains, calls to their
 * own API routes — so the dev server's own address would send those off the
 * tunnel. ngrok and cloudflared pass it through for the same reason.
 */
function publicHost(headers: IncomingHttpHeaders): string | undefined {
  const forwarded = headers['x-forwarded-host'];
  return typeof forwarded === 'string' ? forwarded : headers.host;
}

/**
 * The Origin to show the dev server.
 *
 * Next.js refuses cross-origin requests to its dev resources (`/_next/*` and
 * `/__nextjs*`, HMR included), and the tunnel's host is not an origin it
 * allows. Those paths get the local origin instead, but only when the browser
 * was on the tunnel itself, so a third-party page gains nothing. Other paths
 * keep the browser's Origin: Server Actions compare it against
 * x-forwarded-host, which still names the tunnel.
 */
function devOrigin(req: IncomingMessage): string | undefined {
  const { origin } = req.headers;
  const url = req.url ?? '/';
  if (!origin || (!url.includes('/_next') && !url.includes('/__nextjs'))) {
    return origin;
  }
  let from: string;
  try {
    from = new URL(origin).host;
  } catch {
    return origin;
  }
  return from === req.headers.host || from === publicHost(req.headers)
    ? LOCAL_ORIGIN
    : origin;
}

function localHeaders(req: IncomingMessage): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name)) headers[name] = value;
  }
  headers.host = publicHost(req.headers) ?? `localhost:${PORT}`;
  const origin = devOrigin(req);
  if (origin) headers.origin = origin;
  return headers;
}

function fail(req: IncomingMessage, res: ServerResponse, err: unknown) {
  const reason = ConnectError.from(err);
  // biome-ignore lint/suspicious/noConsole: the deployment's runtime logs
  console.error(`${req.method} ${req.url}: ${reason.message}`);
  if (res.headersSent) {
    // Mid-response, an incomplete one is the only signal left.
    res.destroy();
    return;
  }
  // Unavailable is no `vc dev` connected; anything else, the dev server's end.
  res.statusCode = reason.code === Code.Unavailable ? 503 : 502;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: reason.rawMessage }));
}

/**
 * Send a request to the dev server and relay its response as sent, encoding
 * included.
 */
async function forward(req: IncomingMessage, res: ServerResponse) {
  // No agent, so one request per Dial and `Connection: close`.
  const local = request({
    createConnection: dial,
    method: req.method,
    path: req.url,
    headers: localHeaders(req),
  });
  // The browser went away: abandon the conn rather than let it run on.
  res.once('close', () => {
    if (!res.writableFinished) local.destroy();
  });
  // `on`: the socket can fail again after the response has started.
  const answered = new Promise<IncomingMessage>((resolve, reject) => {
    local.once('response', resolve);
    local.on('error', reject);
  });
  // pipe, not pipeline: a failed conn must not take the browser's request,
  // and with it the chance to answer, down too.
  req.on('error', () => local.destroy());
  req.pipe(local);

  try {
    const upstream = await answered;
    res.statusCode = upstream.statusCode ?? 502;
    for (const [name, value] of Object.entries(upstream.headers)) {
      // Repeated Set-Cookie stays an array, and so separate headers.
      if (value !== undefined && !HOP_BY_HOP.has(name)) {
        res.setHeader(name, value);
      }
    }
    // Streamed, so server-sent events and other long responses arrive as the
    // dev server produces them.
    await pipeline(upstream, res);
  } catch (err) {
    fail(req, res, err);
  }
}

// 1005 and 1006 report a close rather than being sent in one.
function sendable(code: number): number {
  if (
    (code >= 1000 && code <= 1003) ||
    (code >= 1007 && code <= 1014) ||
    (code >= 3000 && code <= 4999)
  ) {
    return code;
  }
  // A side lost rather than closed: the browser should come back.
  return code === 1005 ? 1000 : 1012;
}

/**
 * Relay a WebSocket, HMR included.
 *
 * Connects to the dev server before accepting the browser, so a refused
 * connection is a refused handshake, which the browser retries, rather than a
 * socket that opens and says nothing.
 */
async function relayWebSocket(req: IncomingMessage, res: ServerResponse) {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(localHeaders(req))) {
    if (value === undefined || WS_HANDSHAKE.has(name)) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  const protocols = req.headers['sec-websocket-protocol']
    ?.split(',')
    .map(p => p.trim());
  const local = new WebSocket(
    `ws://localhost:${PORT}${req.url ?? '/'}`,
    protocols,
    { createConnection: dial, headers, maxPayload: MAX_MESSAGE_BYTES }
  );

  // The dev server may speak first (Next sends its manifest on connect), so
  // hold what arrives before the browser is accepted.
  let browser: WebSocket | undefined;
  const early: [WebSocket.RawData, boolean][] = [];
  local.on('message', (data, isBinary) => {
    if (browser) browser.send(data, { binary: isBinary });
    else early.push([data, isBinary]);
  });
  // Also before the browser is accepted, so it isn't left open on a dev
  // server that's gone.
  let localClosed: { code: number; reason: Buffer } | undefined;
  local.on('close', (code, reason) => {
    if (browser) browser.close(sendable(code), reason);
    else localClosed = { code, reason };
  });

  const outcome = await new Promise<{ status?: number; error?: unknown }>(
    resolve => {
      local.once('open', () => resolve({}));
      local.once('unexpected-response', (_req, upstream) => {
        upstream.resume();
        resolve({ status: upstream.statusCode ?? 502 });
      });
      local.once('error', error => resolve({ error }));
    }
  );
  if (outcome.error !== undefined || outcome.status !== undefined) {
    local.terminate();
    if (outcome.status === undefined) {
      fail(req, res, outcome.error);
      return;
    }
    res.statusCode = outcome.status;
    res.end();
    return;
  }

  // upgradeWebSocket() answers with the first subprotocol the browser offered,
  // so offer it only the one the dev server chose. Choosing none of them
  // already failed the dev server's side above.
  if (local.protocol) req.headers['sec-websocket-protocol'] = local.protocol;

  try {
    await experimental_upgradeWebSocket(
      (accepted: WebSocket) => {
        browser = accepted;
        if (localClosed) {
          accepted.close(sendable(localClosed.code), localClosed.reason);
          return;
        }
        for (const [data, isBinary] of early.splice(0)) {
          accepted.send(data, { binary: isBinary });
        }
        accepted.on('message', (data, isBinary) =>
          local.send(data, { binary: isBinary })
        );
        accepted.on('close', (code, reason) =>
          local.close(sendable(code), reason)
        );
        accepted.on('error', () => local.terminate());
        local.on('error', () => accepted.terminate());
      },
      { maxPayload: MAX_MESSAGE_BYTES }
    );
  } catch (err) {
    // The browser was never accepted, so nothing else ends the dev server's
    // side, and its conn would count against the tunnel's cap.
    local.terminate();
    throw err;
  }
}

/**
 * The URL as the project's routes left it: the routed path, from the
 * deployment's last route, and the query without it. The query's other pairs
 * stay as the browser and the project's rewrites sent them. A request that
 * reached the function by its own path has no routed path.
 */
export function routedUrl(url: string): string {
  const query = url.indexOf('?');
  if (query === -1) return url;
  const pairs = url.slice(query + 1).split('&');
  const name = (pair: string) => pair.split('=', 1)[0];
  // The deployment appends its own last, after anything the browser sent.
  let ours = -1;
  pairs.forEach((pair, i) => {
    if (name(pair) === ROUTED_PATH_PARAM) ours = i;
  });
  if (ours === -1) return url;
  const path = decodeURIComponent(
    pairs[ours].slice(ROUTED_PATH_PARAM.length + 1).replace(/\+/g, ' ')
  );
  const rest = pairs.filter(pair => name(pair) !== ROUTED_PATH_PARAM);
  return rest.length ? `${path}?${rest.join('&')}` : path;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  // Every conn reaches the dev server's port whatever the path says, so a
  // `//host` path stays a path there. An absolute-form target doesn't belong
  // here at all.
  if (!req.url?.startsWith('/')) {
    res.statusCode = 400;
    res.end();
    return;
  }
  // A request that reached the function directly keeps its own path: its
  // ROUTED_PATH_PARAM is the visitor's, which would skip the project's routes.
  const routed = req.headers[ROUTED_HEADER] === '1';
  delete req.headers[ROUTED_HEADER];
  if (routed) req.url = routedUrl(req.url);
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    await relayWebSocket(req, res);
  } else {
    await forward(req, res);
  }
}
