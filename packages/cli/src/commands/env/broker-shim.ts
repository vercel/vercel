// Loaded into the user's subprocess by `vc env run --experimental` via NODE_OPTIONS=--require.
// Monkey-patches http.request, https.request, and globalThis.fetch so every
// outbound HTTP/HTTPS call is routed through the local broker, which performs
// dummy <-> real env-var substitution in the broker. Uses only Node built-ins.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { Writable, PassThrough } from 'node:stream';
import { URL } from 'node:url';
import type { Socket } from 'node:net';
import type { ClientRequest } from 'node:http';

interface BrokerEnvelopeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

interface BrokerEnvelopeReply {
  status: number;
  statusMessage?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  error?: string;
}

interface ShimConnectOptions {
  host?: string;
  hostname?: string;
  port?: number;
}

interface NetConnectParsed {
  options: ShimConnectOptions;
  callback?: () => void;
}

const brokerUrlStr = process.env.VC_ENV_BROKER_URL;
if (!brokerUrlStr) {
  // Subprocess was not started via brokered env run (or env was cleared).
} else {
  const broker = new URL(brokerUrlStr);
  const localToken = process.env.VC_ENV_BROKER_LOCAL_TOKEN || '';
  const tcpBrokerPort =
    process.env.VC_ENV_BROKER_TCP_RELAY_PORT || broker.port || '80';
  const hostAliases: Record<string, string> = (() => {
    try {
      return JSON.parse(
        process.env.VC_ENV_BROKER_HOST_ALIASES || '{}'
      ) as Record<string, string>;
    } catch {
      return {};
    }
  })();

  const origHttpRequest = http.request.bind(http);
  const origNetConnect = net.connect.bind(net);
  const origSocketConnect = net.Socket.prototype.connect;
  const origTlsConnect = tls.connect.bind(tls);
  const origFetch =
    typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : null;

  const DUMMY_HOST_RE = /^vbroker-[a-z0-9-]+-[0-9a-f]{20}\.xx$/;

  function postEnvelope(
    envelope: BrokerEnvelopeRequest,
    callback: (err: Error | null, reply?: BrokerEnvelopeReply) => void
  ) {
    const json = Buffer.from(JSON.stringify(envelope), 'utf-8');
    const req = origHttpRequest(
      {
        method: 'POST',
        hostname: broker.hostname,
        port: broker.port || 80,
        path: '/broker',
        headers: {
          'content-type': 'application/json',
          'content-length': json.length,
          'x-vc-env-broker-token': localToken,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const reply = JSON.parse(
              Buffer.concat(
                chunks as unknown as readonly Uint8Array[]
              ).toString('utf-8')
            ) as BrokerEnvelopeReply;
            if (res.statusCode && res.statusCode >= 400) {
              callback(
                new Error(
                  `broker error ${res.statusCode}: ${reply.error || ''}`
                )
              );
            } else {
              callback(null, reply);
            }
          } catch (e) {
            callback(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );
    req.on('error', callback);
    req.end(json);
  }

  function normalizeHeaders(rawHeaders: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!rawHeaders) return out;
    if (Array.isArray(rawHeaders)) {
      for (let i = 0; i < rawHeaders.length; i += 2) {
        out[String(rawHeaders[i]).toLowerCase()] = String(rawHeaders[i + 1]);
      }
      return out;
    }
    if (
      typeof rawHeaders === 'object' &&
      rawHeaders !== null &&
      'forEach' in rawHeaders &&
      typeof (rawHeaders as Headers).forEach === 'function' &&
      'get' in rawHeaders &&
      typeof (rawHeaders as Headers).get === 'function'
    ) {
      (rawHeaders as Headers).forEach((v, k) => {
        out[k.toLowerCase()] = v;
      });
      return out;
    }
    for (const [k, v] of Object.entries(
      rawHeaders as Record<string, string | string[]>
    )) {
      if (Array.isArray(v)) out[k.toLowerCase()] = v.join(', ');
      else if (v != null) out[k.toLowerCase()] = String(v);
    }
    return out;
  }

  function parseNetConnectArgs(args: unknown[]): NetConnectParsed {
    let options: NetConnectParsed['options'] = {};
    let callback: (() => void) | undefined;

    if (typeof args[0] === 'object' && args[0] !== null) {
      options = { ...(args[0] as ShimConnectOptions) };
      callback =
        typeof args[1] === 'function' ? (args[1] as () => void) : undefined;
    } else {
      options = {
        port: args[0] as number,
        host: typeof args[1] === 'string' ? args[1] : undefined,
      };
      callback =
        typeof args[1] === 'function'
          ? (args[1] as () => void)
          : typeof args[2] === 'function'
            ? (args[2] as () => void)
            : undefined;
    }

    return { options, callback };
  }

  function setupTcpTunnel(
    socket: Socket,
    host: string,
    port: number,
    callback?: () => void
  ) {
    socket.once('connect', () => {
      socket.write(`${localToken}\t${host}\t${port}\n`);
    });

    if (callback) {
      socket.once('connect', callback);
    }

    return socket;
  }

  function connectTcpThroughBroker(
    host: string,
    port: number,
    callback?: () => void
  ) {
    const socket = origNetConnect({
      host: broker.hostname,
      port: Number(tcpBrokerPort),
    });
    return setupTcpTunnel(socket, host, port, callback);
  }

  function patchNetConnect() {
    function patchedConnect(...args: unknown[]) {
      const { options, callback } = parseNetConnectArgs(args);
      const host = options.host || options.hostname || 'localhost';
      const port = Number(options.port);
      if (
        typeof host === 'string' &&
        DUMMY_HOST_RE.test(host) &&
        Number.isInteger(port)
      ) {
        return connectTcpThroughBroker(host, port, callback);
      }
      return origNetConnect(...(args as Parameters<typeof origNetConnect>));
    }

    net.connect = patchedConnect as typeof net.connect;
    net.createConnection = patchedConnect as typeof net.createConnection;
    net.Socket.prototype.connect = function patchedSocketConnect(
      this: Socket,
      ...args: unknown[]
    ) {
      const { options, callback } = parseNetConnectArgs(args);
      const host = options.host || options.hostname || 'localhost';
      const port = Number(options.port);
      if (
        typeof host === 'string' &&
        DUMMY_HOST_RE.test(host) &&
        Number.isInteger(port)
      ) {
        setupTcpTunnel(this, host, port, callback);
        return (
          origSocketConnect as (
            this: Socket,
            opts: ShimConnectOptions
          ) => Socket
        ).call(this, { host: broker.hostname, port: Number(tcpBrokerPort) });
      }
      return origSocketConnect.apply(
        this,
        args as Parameters<typeof origSocketConnect>
      );
    };
  }

  function realHostFor(host: string | undefined) {
    return typeof host === 'string' ? hostAliases[host] : undefined;
  }

  function patchTlsConnect() {
    const patchedTlsConnect = function patchedTlsConnect(...args: unknown[]) {
      if (args[0] && typeof args[0] === 'object') {
        const options: tls.ConnectionOptions = {
          ...(args[0] as tls.ConnectionOptions),
        };
        const realServername = realHostFor(options.servername);
        const connectHost =
          typeof options.host === 'string'
            ? options.host
            : (options as tls.ConnectionOptions & { hostname?: string })
                .hostname;
        const realHost = realHostFor(connectHost);
        if (realServername) {
          options.servername = realServername;
        } else if (!options.servername && realHost) {
          options.servername = realHost;
        }
        if (realHost && !options.socket) {
          options.host = realHost;
        }
        return (origTlsConnect as (...a: unknown[]) => tls.TLSSocket)(
          options,
          ...args.slice(1)
        );
      }

      if (typeof args[1] === 'string') {
        const realHost = realHostFor(args[1]);
        if (realHost) {
          const nextArgs = [...args];
          nextArgs[1] = realHost;
          return (origTlsConnect as (...a: unknown[]) => tls.TLSSocket)(
            ...nextArgs
          );
        }
      }

      return (origTlsConnect as (...a: unknown[]) => tls.TLSSocket)(...args);
    };
    tls.connect = patchedTlsConnect as typeof tls.connect;
  }

  function fakeRequest(
    protocol: string,
    urlString: string,
    method: string,
    headers: Record<string, string>
  ) {
    const bodyChunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, enc, cb) {
        bodyChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc)
        );
        cb();
      },
    }) as Writable & {
      setHeader: (k: string, v: string) => void;
      getHeader: (k: string) => string | undefined;
      removeHeader: (k: string) => void;
      emit: ClientRequest['emit'];
    };

    writable.setHeader = (k, v) => {
      headers[k.toLowerCase()] = String(v);
    };
    writable.getHeader = k => headers[k.toLowerCase()];
    writable.removeHeader = k => {
      delete headers[k.toLowerCase()];
    };

    writable.on('finish', () => {
      const body = Buffer.concat(
        bodyChunks as unknown as readonly Uint8Array[]
      );
      postEnvelope(
        {
          method,
          url: urlString,
          headers,
          bodyBase64: body.length ? body.toString('base64') : '',
        },
        (err, reply) => {
          if (err) {
            writable.emit('error', err);
            return;
          }
          if (!reply) {
            writable.emit('error', new Error('empty broker reply'));
            return;
          }
          const res = new PassThrough() as PassThrough & {
            statusCode: number;
            statusMessage: string;
            headers: Record<string, string>;
            rawHeaders: string[];
            httpVersion: string;
          };
          res.statusCode = reply.status;
          res.statusMessage = reply.statusMessage || '';
          res.headers = reply.headers || {};
          res.rawHeaders = [];
          for (const [k, v] of Object.entries(res.headers)) {
            res.rawHeaders.push(k, v);
          }
          res.httpVersion = '1.1';
          writable.emit('response', res);
          const bodyBuf = reply.bodyBase64
            ? Buffer.from(reply.bodyBase64, 'base64')
            : Buffer.alloc(0);
          res.end(bodyBuf);
        }
      );
    });

    return writable;
  }

  function parseHttpRequestArgs(defaultProtocol: string, args: unknown[]) {
    let url: URL | undefined;
    let options: Record<string, unknown> | undefined;
    let callback: ((res: http.IncomingMessage) => void) | undefined;
    let i = 0;
    if (typeof args[0] === 'string' || args[0] instanceof URL) {
      url = new URL(String(args[0]));
      i = 1;
    }
    if (args[i] && typeof args[i] === 'object' && !(args[i] instanceof URL)) {
      options = args[i] as Record<string, unknown>;
      i++;
    }
    if (typeof args[i] === 'function') {
      callback = args[i] as (res: http.IncomingMessage) => void;
    }
    options = options || {};

    if (!url) {
      const protocol = (options.protocol as string) || defaultProtocol;
      const host =
        (options.hostname as string) || (options.host as string) || 'localhost';
      const port = options.port ?? (protocol === 'https:' ? 443 : 80);
      const path = (options.path as string) || '/';
      url = new URL(`${protocol}//${host}:${port}${path}`);
    }
    const method = ((options.method as string) || 'GET').toUpperCase();
    const headers = normalizeHeaders(options.headers);
    if (!headers.host) headers.host = url.host;
    return { url: url.toString(), method, headers, callback };
  }

  function patchHttpModule(
    mod: typeof http | typeof https,
    defaultProtocol: string
  ) {
    mod.request = function patchedRequest(...args: unknown[]) {
      const { url, method, headers, callback } = parseHttpRequestArgs(
        defaultProtocol,
        args
      );
      const req = fakeRequest(defaultProtocol, url, method, headers);
      if (callback) req.once('response', callback);
      return req as unknown as ClientRequest;
    };
    mod.get = function patchedGet(...args: unknown[]) {
      const req = (mod.request as (...a: unknown[]) => ClientRequest)(...args);
      req.end();
      return req;
    };
  }

  patchHttpModule(http, 'http:');
  patchHttpModule(https, 'https:');
  patchNetConnect();
  patchTlsConnect();

  async function bodyToBuffer(body: unknown): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (typeof body === 'string') return Buffer.from(body, 'utf-8');
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (
      typeof body === 'object' &&
      body !== null &&
      'arrayBuffer' in body &&
      typeof (body as Blob).arrayBuffer === 'function'
    ) {
      return Buffer.from(await (body as Blob).arrayBuffer());
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      'getReader' in body &&
      typeof (
        body as {
          getReader: () => { read(): Promise<IteratorResult<Uint8Array>> };
        }
      ).getReader === 'function'
    ) {
      const chunks: Buffer[] = [];
      const reader = (
        body as {
          getReader: () => { read(): Promise<IteratorResult<Uint8Array>> };
        }
      ).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value as Uint8Array));
      }
      return Buffer.concat(chunks as unknown as readonly Uint8Array[]);
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      Symbol.asyncIterator in body
    ) {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks as unknown as readonly Uint8Array[]);
    }
    return Buffer.from(String(body), 'utf-8');
  }

  if (origFetch && typeof globalThis.Response === 'function') {
    globalThis.fetch = async function patchedFetch(
      input: string | URL | Request,
      init: globalThis.RequestInit = {}
    ) {
      const urlString =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input && 'url' in input
              ? input.url
              : String(input);
      const method = (
        init.method ||
        (typeof input === 'object' && input !== null && 'method' in input
          ? (input as Request).method
          : undefined) ||
        'GET'
      ).toUpperCase();
      const headers = normalizeHeaders(
        init.headers ||
          (typeof input === 'object' && input !== null && 'headers' in input
            ? (input as Request).headers
            : undefined)
      );

      const body =
        init.body ??
        (typeof input === 'object' && input !== null && 'body' in input
          ? (input as Request).body
          : undefined);
      const bodyBuf = await bodyToBuffer(body);

      return new Promise<globalThis.Response>((resolve, reject) => {
        postEnvelope(
          {
            method,
            url: urlString,
            headers,
            bodyBase64: bodyBuf.length ? bodyBuf.toString('base64') : '',
          },
          (err, reply) => {
            if (err) return reject(err);
            if (!reply) return reject(new Error('empty broker reply'));
            const resBody = reply.bodyBase64
              ? Buffer.from(reply.bodyBase64, 'base64')
              : Buffer.alloc(0);
            resolve(
              new globalThis.Response(new Uint8Array(resBody), {
                status: reply.status,
                statusText: reply.statusMessage || '',
                headers: reply.headers || {},
              })
            );
          }
        );
      });
    };
  }
}
