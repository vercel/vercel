import net from 'node:net';
import output from '../../../output-manager';
import type { Substitutions } from '.';

export interface PostgresProxy {
  port: number;
  close(): Promise<void>;
}

export interface PostgresUpstream {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  servername: string;
}

const POSTGRES_URL_RE = /^postgres(ql)?:\/\//i;

type ProxySocket = net.Socket;

interface PgClientLike {
  connection: {
    stream: ProxySocket;
    removeAllListeners(): void;
  };
  connect(): Promise<void>;
  end(): Promise<void>;
  removeAllListeners(): void;
}

interface PgModuleLike {
  Client: new (opts: {
    connectionString: string;
    ssl: { rejectUnauthorized: boolean };
    connectionTimeoutMillis: number;
  }) => PgClientLike;
}

async function loadPg(): Promise<PgModuleLike> {
  // Keep `pg` out of the static CLI graph. The local Postgres broker is a
  // development stand-in for service-side behavior, so only load it if this
  // path is actually exercised.
  const importPg = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<PgModuleLike>;
  try {
    return await importPg('pg');
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Postgres broker requires the optional "pg" package for local upstream auth: ${reason}`
    );
  }
}

export function isPostgresUrl(value: string): boolean {
  return POSTGRES_URL_RE.test(value);
}

export function parsePostgresUpstream(
  connectionString: string
): PostgresUpstream {
  const url = new URL(
    connectionString.replace(/^postgresql:\/\//, 'postgres://')
  );
  const user = decodeURIComponent(url.username || 'postgres');
  const password = decodeURIComponent(url.password || '');
  const database = decodeURIComponent(
    url.pathname.replace(/^\//, '') || 'postgres'
  );
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 5432;
  return {
    host,
    port,
    user,
    password,
    database,
    servername: host,
  };
}

export function buildLocalPostgresUrl(port: number, dummyUrl: string): string {
  try {
    const url = new URL(dummyUrl.replace(/^postgresql:\/\//, 'postgres://'));
    url.hostname = '127.0.0.1';
    url.port = String(port);
    url.searchParams.set('sslmode', 'disable');
    return url.toString();
  } catch {
    return `postgresql://127.0.0.1:${port}/?sslmode=disable`;
  }
}

function writeSocket(socket: ProxySocket, buf: Buffer) {
  socket.write(Uint8Array.from(buf));
}

function substituteValue(value: string, subs: Substitutions): string {
  let out = value;
  for (const [dummy, real] of subs.dummyToReal) {
    if (out.includes(dummy)) out = out.split(dummy).join(real);
  }
  return out;
}

function readExactly(socket: ProxySocket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    const cleanup = () => {
      socket.off('readable', tryRead);
      socket.off('error', onError);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    function tryRead() {
      while (received < length) {
        const chunk = socket.read(length - received);
        if (!chunk) break;
        chunks.push(chunk);
        received += chunk.length;
      }
      if (received < length) {
        socket.once('readable', tryRead);
        return;
      }
      cleanup();
      const buf = Buffer.concat(chunks as unknown as readonly Uint8Array[]);
      resolve(buf.subarray(0, length));
      const extra = buf.subarray(length);
      if (extra.length) socket.unshift(extra);
    }

    socket.on('error', onError);
    tryRead();
  });
}

async function readStartupMessage(socket: ProxySocket): Promise<Buffer> {
  const lenBuf = await readExactly(socket, 4);
  const length = lenBuf.readInt32BE(0);
  if (length < 4) throw new Error('invalid startup message length');
  const rest = await readExactly(socket, length - 4);
  return Buffer.concat([lenBuf, rest] as unknown as readonly Uint8Array[]);
}

function parseStartupParams(startup: Buffer): Record<string, string> {
  const params: Record<string, string> = {};
  let offset = 8;
  while (offset < startup.length - 1) {
    const keyEnd = startup.indexOf(0, offset);
    if (keyEnd === -1) break;
    const key = startup.toString('utf8', offset, keyEnd);
    offset = keyEnd + 1;
    const valEnd = startup.indexOf(0, offset);
    if (valEnd === -1) break;
    const value = startup.toString('utf8', offset, valEnd);
    offset = valEnd + 1;
    if (key) params[key] = value;
  }
  return params;
}

function sendClientHandshake(socket: ProxySocket) {
  // pg-protocol: [type][uint32 length excluding type][payload]
  writeSocket(
    socket,
    Buffer.from([0x52, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00])
  );
  writeSocket(
    socket,
    Buffer.from([
      0x4b, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x01,
    ])
  );
  writeSocket(socket, Buffer.from([0x5a, 0x00, 0x00, 0x00, 0x05, 0x49]));
}

function pipeSockets(a: ProxySocket, b: ProxySocket) {
  a.pipe(b, { end: false });
  b.pipe(a, { end: false });
  a.on('error', () => {
    a.destroy();
    b.destroy();
  });
  b.on('error', () => {
    a.destroy();
    b.destroy();
  });
}

function connectionStringFromUpstream(upstream: PostgresUpstream): string {
  const url = new URL('postgres://localhost/');
  url.username = encodeURIComponent(upstream.user);
  url.password = encodeURIComponent(upstream.password);
  url.hostname = upstream.host;
  url.port = String(upstream.port);
  url.pathname = `/${encodeURIComponent(upstream.database)}`;
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}

async function openUpstreamWithPg(
  upstream: PostgresUpstream
): Promise<{ socket: ProxySocket; close: () => Promise<void> }> {
  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: connectionStringFromUpstream(upstream),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  const socket = client.connection.stream as ProxySocket;
  // Stop pg-protocol from consuming bytes we pipe between the app and Neon.
  socket.removeAllListeners('data');
  client.removeAllListeners();
  client.connection.removeAllListeners();
  return {
    socket,
    close: async () => {
      await client.end();
    },
  };
}

async function handleClient(
  client: net.Socket,
  upstreamConfig: PostgresUpstream,
  subs: Substitutions
) {
  let upstream: { socket: ProxySocket; close: () => Promise<void> } | undefined;
  try {
    const startupBuf = await readStartupMessage(client);
    const params = parseStartupParams(startupBuf);
    const mapped: PostgresUpstream = {
      ...upstreamConfig,
      user: substituteValue(params.user || upstreamConfig.user, subs),
      database: substituteValue(
        params.database || upstreamConfig.database,
        subs
      ),
    };

    upstream = await openUpstreamWithPg(mapped);
    sendClientHandshake(client);
    pipeSockets(client, upstream.socket);
    client.on('close', () => {
      upstream?.close().catch(() => undefined);
    });
    output.debug(
      `[env broker] postgres session ready for ${mapped.user}@${mapped.host}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    output.error(`Postgres broker error: ${msg}`);
    if (e instanceof Error && e.stack) output.debug(e.stack);
    client.destroy();
    if (upstream) await upstream.close().catch(() => undefined);
  }
}

export async function startPostgresProxy(opts: {
  upstreamUrl: string;
  subs: Substitutions;
}): Promise<PostgresProxy> {
  const upstream = parsePostgresUpstream(opts.upstreamUrl);
  const server = net.createServer(client => {
    handleClient(client, upstream, opts.subs);
  });

  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('postgres broker failed to bind');
  }

  output.debug(
    `[env broker] postgres listener on 127.0.0.1:${address.port} -> ${upstream.host}:${upstream.port}`
  );

  return {
    port: address.port,
    close: () =>
      new Promise(resolve => {
        server.close(() => resolve());
      }),
  };
}
