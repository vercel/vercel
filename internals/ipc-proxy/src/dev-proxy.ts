/**
 * The `vercel dev` counterpart to the production IPC proxy.
 *
 * Production ships a prebuilt Go binary because the Lambda handler must be
 * self-contained, but those binaries are Linux-only and a Rust project has no Go
 * toolchain to build a local one. `vercel dev` already runs inside the Node CLI,
 * so the dev proxy lives here instead.
 *
 * Dev has no IPC socket, so this reproduces only the request-facing behavior:
 * `PORT` injection, readiness, `/_vercel/ping`, internal header stripping,
 * service route-prefix stripping, and WebSocket upgrades.
 */
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createConnection, createServer as createTcpServer } from 'node:net';
import type { ChildProcess } from 'node:child_process';

const PING_PATH = '/_vercel/ping';
const INTERNAL_HEADER_PREFIX = 'x-vercel-internal-';
const LOCALHOST = '127.0.0.1';

const DEFAULT_READINESS_TIMEOUT = 5 * 60_000;
const READINESS_POLL_INTERVAL = 100;
const READINESS_DIAL_TIMEOUT = 1_000;

export function normalizeServiceRoutePrefix(rawPrefix?: string): string {
  if (!rawPrefix) return '';

  let prefix = rawPrefix.trim();
  if (!prefix) return '';

  if (!prefix.startsWith('/')) {
    prefix = `/${prefix}`;
  }

  if (prefix !== '/') {
    prefix = prefix.replace(/\/+$/, '');
    if (!prefix) prefix = '/';
  }

  return prefix === '/' ? '' : prefix;
}

export function resolveServiceRoutePrefix(
  env: NodeJS.ProcessEnv = process.env
): string {
  const strip = (env.VERCEL_SERVICE_ROUTE_PREFIX_STRIP ?? '')
    .trim()
    .toLowerCase();
  if (strip !== '1' && strip !== 'true') return '';
  return normalizeServiceRoutePrefix(env.VERCEL_SERVICE_ROUTE_PREFIX);
}

export function stripServiceRoutePrefix(
  pathValue: string,
  prefix: string
): string {
  if (pathValue === '*') return pathValue;

  let normalized = pathValue;
  if (!normalized) {
    normalized = '/';
  } else if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (!prefix) return normalized;
  if (normalized === prefix) return '/';

  if (normalized.startsWith(`${prefix}/`)) {
    return normalized.slice(prefix.length) || '/';
  }

  return normalized;
}

function splitUrl(url: string): { pathname: string; search: string } {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return { pathname: url, search: '' };
  return { pathname: url.slice(0, queryIndex), search: url.slice(queryIndex) };
}

export function rewriteRequestUrl(url: string, prefix: string): string {
  const { pathname, search } = splitUrl(url || '/');
  return `${stripServiceRoutePrefix(pathname, prefix)}${search}`;
}

// Mirrors the production proxy: internal headers never reach user code, and the
// original Host is restored from `X-Forwarded-Host`.
export function sanitizeHeaders(
  headers: IncomingHttpHeaders
): IncomingHttpHeaders {
  const sanitized: IncomingHttpHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) continue;
    sanitized[key] = value;
  }

  const forwardedHost = headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  if (host) {
    sanitized.host = host;
  }

  return sanitized;
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function isPortReachable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ port, host: LOCALHOST });
    const done = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(READINESS_DIAL_TIMEOUT);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForPort(
  port: number,
  child: ChildProcess,
  timeout: number,
  label = 'Dev server'
): Promise<void> {
  let exited: { code: number | null; signal: string | null } | undefined;
  let spawnError: Error | undefined;

  const onExit = (code: number | null, signal: string | null) => {
    exited = { code, signal };
  };
  const onError = (err: Error) => {
    spawnError = err;
  };

  child.once('exit', onExit);
  child.once('error', onError);

  try {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (spawnError) throw spawnError;
      if (exited) {
        throw new Error(
          `${label} exited before it started listening (code: ${exited.code}, signal: ${exited.signal})`
        );
      }
      if (await isPortReachable(port)) return;
      await sleep(READINESS_POLL_INTERVAL);
    }
    throw new Error(`${label} did not start listening within ${timeout}ms`);
  } finally {
    child.removeListener('exit', onExit);
    child.removeListener('error', onError);
  }
}

export interface CreateDevProxyServerOptions {
  /** Port the user's server listens on. */
  targetPort: number;
  /** Service route prefix to strip; normalized internally. */
  routePrefix?: string;
}

// The `vercel dev` counterpart to the production Go proxy. Dev has no IPC
// socket, so this only reproduces the request-facing behavior.
export function createDevProxyServer(
  options: CreateDevProxyServerOptions
): Server {
  const { targetPort } = options;
  const routePrefix = normalizeServiceRoutePrefix(options.routePrefix);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const { pathname } = splitUrl(req.url || '/');
    if (pathname === PING_PATH) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK');
      return;
    }

    const proxyReq = httpRequest(
      {
        host: LOCALHOST,
        port: targetPort,
        method: req.method,
        path: rewriteRequestUrl(req.url || '/', routePrefix),
        headers: sanitizeHeaders(req.headers),
      },
      proxyRes => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.once('error', err => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
      }
      res.end(`Dev proxy error: ${err.message}`);
    });

    // The client went away before the response finished; drop the upstream
    // request. (`res` closing cleanly sets `writableFinished` first.)
    res.once('close', () => {
      if (!res.writableFinished) proxyReq.destroy();
    });
    req.pipe(proxyReq);
  });

  server.on('upgrade', (req, clientSocket, head) => {
    const headers = sanitizeHeaders(req.headers);
    const path = rewriteRequestUrl(req.url || '/', routePrefix);

    const upstream = createConnection(
      { host: LOCALHOST, port: targetPort },
      () => {
        const lines = [`${req.method} ${path} HTTP/${req.httpVersion}`];
        for (const [key, value] of Object.entries(headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) lines.push(`${key}: ${entry}`);
          } else if (value !== undefined) {
            lines.push(`${key}: ${value}`);
          }
        }
        upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (head?.length) upstream.write(new Uint8Array(head));
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      }
    );

    const destroy = () => {
      upstream.destroy();
      clientSocket.destroy();
    };
    upstream.once('error', destroy);
    clientSocket.once('error', destroy);
  });

  return server;
}

export interface StartDevProxyOptions {
  /** Externally assigned port the proxy listens on. Allocated when omitted. */
  port?: number;
  /** Spawns the user's server, which must listen on the injected `PORT`. */
  spawnServer: (internalPort: number) => ChildProcess;
  /** Resolves the service route prefix. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * How long to wait for the spawned server to start listening. Builders
   * compile before spawning, so this only covers server startup; it defaults
   * to a generous 5 minutes for servers that do heavy work before binding.
   */
  readinessTimeout?: number;
  /** Prefix for error messages, e.g. `Standalone Rust dev server`. */
  label?: string;
}

export interface DevProxyHandle {
  port: number;
  pid: number;
  child: ChildProcess;
  close: () => Promise<void>;
}

export async function startDevProxy(
  options: StartDevProxyOptions
): Promise<DevProxyHandle> {
  const {
    spawnServer,
    env = process.env,
    readinessTimeout = DEFAULT_READINESS_TIMEOUT,
    label = 'Dev server',
  } = options;

  const internalPort = await findFreePort();
  const child = spawnServer(internalPort);

  let server: Server | undefined;
  const close = async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server?.close(() => resolve());
        // `close()` alone waits for idle keep-alive sockets to drain, which
        // can stall `vercel dev` shutdown until they time out.
        // `closeAllConnections()` was added in Node 18.2.0 but the CLI
        // supports `node >= 18`, so guard against older 18.x runtimes where
        // this method is undefined.
        server?.closeAllConnections?.();
      });
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  };

  try {
    await waitForPort(internalPort, child, readinessTimeout, label);

    server = createDevProxyServer({
      targetPort: internalPort,
      routePrefix: resolveServiceRoutePrefix(env),
    });

    const listenPort = options.port ?? (await findFreePort());
    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject);
      server?.listen(listenPort, () => resolve());
    });

    if (!child.pid) {
      throw new Error(`${label} started without a PID`);
    }

    return { port: listenPort, pid: child.pid, child, close };
  } catch (err) {
    await close();
    throw err;
  }
}
