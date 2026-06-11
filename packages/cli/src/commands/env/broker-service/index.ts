// Local broker for `vc env run --experimental`. Listens on a random port and:
//   - Accepts POST /broker envelopes from the subprocess shim.
//   - Substitutes dummy values -> real values in the request (url/headers/body).
//   - Makes the real outbound call (http or https).
//   - Substitutes real values -> dummy values in the response (defense in
//     depth: keeps real values from ever reaching the subprocess).
//   - Returns the response as a JSON envelope.
//   - Relays raw TCP for dummy hostnames (session-scoped tunnel).
//
// Real secrets live only in this process for the duration of the session.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import output from '../../../output-manager';
import {
  buildLocalPostgresUrl,
  isPostgresUrl,
  startPostgresProxy,
  type PostgresProxy,
} from './postgres';

export interface Substitutions {
  dummyToReal: Map<string, string>;
  realToDummy: Map<string, string>;
}

export async function startBrokerService(opts: {
  env: Record<string, string>;
  subs: Substitutions;
  sessionId: string;
}): Promise<BrokerService> {
  const broker = await startBroker({
    subs: opts.subs,
    sessionId: opts.sessionId,
  });

  const env = { ...opts.env };
  const postgresProxies: PostgresProxy[] = [];
  const postgresRealUrls = new Set<string>();

  try {
    for (const real of opts.subs.dummyToReal.values()) {
      if (isPostgresUrl(real)) postgresRealUrls.add(real);
    }

    for (const realUrl of postgresRealUrls) {
      const pgProxy = await startPostgresProxy({
        upstreamUrl: realUrl,
        subs: opts.subs,
      });
      postgresProxies.push(pgProxy);

      for (const [key, dummy] of Object.entries(env)) {
        if (opts.subs.dummyToReal.get(dummy) === realUrl) {
          env[key] = buildLocalPostgresUrl(pgProxy.port, dummy);
        }
      }
    }
  } catch (e) {
    await Promise.all(postgresProxies.map(proxy => proxy.close()));
    await broker.close();
    throw e;
  }

  return {
    env,
    broker,
    postgresListenerCount: postgresProxies.length,
    close: async () => {
      await Promise.all(postgresProxies.map(proxy => proxy.close()));
      await broker.close();
    },
  };
}

export interface Broker {
  port: number;
  tcpPort: number;
  url: string;
  sessionId: string;
  close(): Promise<void>;
}

export interface BrokerService {
  env: Record<string, string>;
  broker: Broker;
  postgresListenerCount: number;
  close(): Promise<void>;
}

export interface BrokeredEnvService extends BrokerService {
  hostAliases: Record<string, string>;
  sessionId: string;
  substitutableCount: number;
}

const URL_LIKE_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

function makeDummy(key: string, real: string): string {
  const nonce = randomBytes(10).toString('hex');
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const m = real.match(URL_LIKE_RE);
  if (m) {
    return `${m[1]}://vbroker-${slug}-${nonce}.xx`;
  }
  return `vbroker_${slug.replace(/-/g, '_')}_${nonce}_xx`;
}

function addSubstitution(
  dummyToReal: Map<string, string>,
  realToDummy: Map<string, string>,
  dummy: string,
  real: string,
  reverseSubMinLen: number
) {
  dummyToReal.set(dummy, real);
  if (real.length >= reverseSubMinLen) {
    realToDummy.set(real, dummy);
  }
}

function addUrlHostSubstitution(
  dummyToReal: Map<string, string>,
  realToDummy: Map<string, string>,
  hostAliases: Record<string, string>,
  dummy: string,
  real: string,
  reverseSubMinLen: number
) {
  let dummyUrl: URL;
  let realUrl: URL;
  try {
    dummyUrl = new URL(dummy);
    realUrl = new URL(real);
  } catch {
    return;
  }

  addSubstitution(
    dummyToReal,
    realToDummy,
    dummyUrl.host,
    realUrl.host,
    reverseSubMinLen
  );
  hostAliases[dummyUrl.host] = realUrl.host;
}

export async function startBrokeredEnvService(
  realEnv: Record<string, string>
): Promise<BrokeredEnvService> {
  const env: Record<string, string> = {};
  const dummyToReal = new Map<string, string>();
  const realToDummy = new Map<string, string>();
  const hostAliases: Record<string, string> = {};
  const reverseSubMinLen = 8;
  let substitutableCount = 0;

  for (const [key, real] of Object.entries(realEnv)) {
    if (!real) {
      env[key] = real;
      continue;
    }
    const dummy = makeDummy(key, real);
    env[key] = dummy;
    addSubstitution(dummyToReal, realToDummy, dummy, real, reverseSubMinLen);
    addUrlHostSubstitution(
      dummyToReal,
      realToDummy,
      hostAliases,
      dummy,
      real,
      reverseSubMinLen
    );
    substitutableCount++;
  }

  const sessionId = randomBytes(16).toString('hex');
  const service = await startBrokerService({
    env,
    subs: { dummyToReal, realToDummy },
    sessionId,
  });

  return {
    ...service,
    hostAliases,
    sessionId,
    substitutableCount,
  };
}

function substituteString(s: string, table: Map<string, string>): string {
  if (!s) return s;
  let out = s;
  for (const [from, to] of table) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function substituteBuffer(buf: Buffer, table: Map<string, string>): Buffer {
  // ASCII dummies are safe to byte-replace even in binary bodies because the
  // dummy alphabet (`vbroker_..._xx` or `<scheme>://vbroker-...-.xx`) is pure
  // ASCII and can't collide with non-ASCII bytes.
  let out = buf;
  for (const [from, to] of table) {
    const fromBuf = Buffer.from(from, 'utf-8');
    const toBuf = Buffer.from(to, 'utf-8');
    if (out.indexOf(fromBuf as unknown as Uint8Array) === -1) continue;
    const parts: Buffer[] = [];
    let cursor = 0;
    let idx: number;
    while (
      (idx = out.indexOf(fromBuf as unknown as Uint8Array, cursor)) !== -1
    ) {
      parts.push(out.subarray(cursor, idx));
      parts.push(toBuf);
      cursor = idx + fromBuf.length;
    }
    parts.push(out.subarray(cursor));
    out = Buffer.concat(parts as unknown as readonly Uint8Array[]);
  }
  return out;
}

function substituteHeaders(
  headers: Record<string, string>,
  table: Map<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = substituteString(v, table);
  }
  return out;
}

interface Envelope {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

interface ReplyEnvelope {
  status: number;
  statusMessage: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

function readJson(req: http.IncomingMessage): Promise<Envelope> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(
          JSON.parse(
            Buffer.concat(chunks as unknown as readonly Uint8Array[]).toString(
              'utf-8'
            )
          )
        );
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function doUpstreamRequest(
  env: Envelope,
  body: Buffer
): Promise<{ res: http.IncomingMessage; bodyChunks: Buffer[] }> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(env.url);
    } catch {
      reject(new Error(`bad upstream url: ${env.url}`));
      return;
    }
    const isHttps = target.protocol === 'https:';
    const mod = isHttps ? https : http;
    const headers = { ...env.headers };
    if (body.length || headers['content-length'] != null) {
      headers['content-length'] = String(body.length);
    }
    headers.host = target.host;
    const upstream = mod.request(
      {
        method: env.method,
        hostname: target.hostname,
        port: target.port ? Number(target.port) : isHttps ? 443 : 80,
        path: target.pathname + target.search,
        headers,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ res, bodyChunks: chunks }));
        res.on('error', reject);
      }
    );
    upstream.on('error', reject);
    if (body.length) upstream.write(Uint8Array.from(body));
    upstream.end();
  });
}

function parseTcpConnectTarget(url: string): { host: string; port: number } {
  const target = new URL(url, 'http://vbroker.local');
  const host = target.searchParams.get('host');
  const port = Number(target.searchParams.get('port'));
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('bad tcp connect target');
  }
  return { host, port };
}

function handleTcpTunnel(
  socket: net.Socket,
  head: Buffer,
  host: string,
  port: number,
  subs: Substitutions
) {
  const realHost = substituteString(host, subs.dummyToReal);
  output.debug(`[env broker] TCP ${host}:${port} -> ${realHost}:${port}`);

  const upstream = net.connect({ host: realHost, port }, () => {
    if (head.length) upstream.write(Uint8Array.from(head));
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on('error', e => {
    output.debug(`[env broker] tcp upstream error: ${e.message}`);
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
}

export async function startBroker(opts: {
  subs: Substitutions;
  sessionId: string;
}): Promise<Broker> {
  const { subs, sessionId } = opts;

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/broker') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (req.headers['x-vc-env-broker-token'] !== sessionId) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad session' }));
      return;
    }

    let env: Envelope;
    try {
      env = await readJson(req);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad envelope' }));
      return;
    }

    const reqBodyDummy = env.bodyBase64
      ? Buffer.from(env.bodyBase64, 'base64')
      : Buffer.alloc(0);

    // dummy -> real on request
    const realUrl = substituteString(env.url, subs.dummyToReal);
    const realHeaders = substituteHeaders(env.headers, subs.dummyToReal);
    const realBody = substituteBuffer(reqBodyDummy, subs.dummyToReal);

    const subsForLog: string[] = [];
    for (const [dummy, real] of subs.dummyToReal) {
      const where: string[] = [];
      if (env.url.includes(dummy)) where.push('url');
      if (
        reqBodyDummy.indexOf(
          Buffer.from(dummy, 'utf-8') as unknown as Uint8Array
        ) !== -1
      ) {
        where.push('body');
      }
      for (const [k, v] of Object.entries(env.headers)) {
        if (v.includes(dummy)) where.push(`header:${k}`);
      }
      if (where.length) {
        subsForLog.push(`  ${dummy} -> ${real} (in: ${where.join(', ')})`);
      }
    }
    output.debug(
      `[env broker] ${env.method} ${env.url}` +
        (subsForLog.length ? `\n${subsForLog.join('\n')}` : '')
    );

    let upstream: {
      res: http.IncomingMessage;
      bodyChunks: Buffer[];
    };
    try {
      upstream = await doUpstreamRequest(
        { ...env, url: realUrl, headers: realHeaders },
        realBody
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      output.debug(`[env broker] upstream error: ${msg}`);
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream', detail: msg }));
      return;
    }

    // real -> dummy on response (so the subprocess never sees real values)
    const upBody = Buffer.concat(
      upstream.bodyChunks as unknown as readonly Uint8Array[]
    );
    const safeBody = substituteBuffer(upBody, subs.realToDummy);
    const upHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(upstream.res.headers)) {
      if (v == null) continue;
      const joined = Array.isArray(v) ? v.join(', ') : String(v);
      // Skip hop-by-hop and length headers; we'll recompute length.
      const kl = k.toLowerCase();
      if (
        kl === 'content-length' ||
        kl === 'transfer-encoding' ||
        kl === 'connection'
      ) {
        continue;
      }
      upHeaders[kl] = substituteString(joined, subs.realToDummy);
    }
    upHeaders['content-length'] = String(safeBody.length);

    const reply: ReplyEnvelope = {
      status: upstream.res.statusCode ?? 200,
      statusMessage: upstream.res.statusMessage ?? '',
      headers: upHeaders,
      bodyBase64: safeBody.toString('base64'),
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply));
  });

  server.on('connect', (req, socket, head) => {
    if (req.headers['x-vc-env-broker-token'] !== sessionId) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.end();
      return;
    }

    let host: string;
    let port: number;
    try {
      ({ host, port } = parseTcpConnectTarget(req.url ?? ''));
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.end();
      return;
    }

    const realHost = substituteString(host, subs.dummyToReal);
    output.debug(`[env broker] TCP ${host}:${port} -> ${realHost}:${port}`);
    const upstream = net.connect({ host: realHost, port }, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(Uint8Array.from(head));
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    upstream.on('error', e => {
      output.debug(`[env broker] tcp upstream error: ${e.message}`);
      if (socket.writable) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
      socket.destroy();
    });
    socket.on('error', () => upstream.destroy());
  });

  const tcpServer = net.createServer(socket => {
    const chunks: Buffer[] = [];
    socket.on('data', function onData(chunk) {
      chunks.push(chunk);
      const pending = Buffer.concat(chunks as unknown as readonly Uint8Array[]);
      const headerEnd = pending.indexOf('\n');
      if (headerEnd === -1) return;

      socket.off('data', onData);
      const line = pending.subarray(0, headerEnd).toString('utf-8').trimEnd();
      const head = pending.subarray(headerEnd + 1);
      const [gotSessionId, host, portText] = line.split('\t');
      const port = Number(portText);
      if (
        gotSessionId !== sessionId ||
        !host ||
        !Number.isInteger(port) ||
        port <= 0 ||
        port > 65535
      ) {
        socket.destroy();
        return;
      }

      handleTcpTunnel(socket, head, host, port, subs);
    });
  });

  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  await new Promise<void>(resolve =>
    tcpServer.listen(0, '127.0.0.1', () => resolve())
  );
  const address = server.address();
  const tcpAddress = tcpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('broker failed to bind');
  }
  if (!tcpAddress || typeof tcpAddress === 'string') {
    throw new Error('tcp broker failed to bind');
  }
  const port = address.port;
  const tcpPort = tcpAddress.port;
  const url = `http://127.0.0.1:${port}`;

  return {
    port,
    tcpPort,
    url,
    sessionId,
    close: () =>
      new Promise(resolve => {
        server.close(() => {
          tcpServer.close(() => resolve());
        });
      }),
  };
}
