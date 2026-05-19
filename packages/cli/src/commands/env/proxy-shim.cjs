// Loaded into the user's subprocess by `vc env proxy` via NODE_OPTIONS=--require.
// Monkey-patches http.request, https.request, and globalThis.fetch so every
// outbound HTTP/HTTPS call is routed through the local broker, which performs
// dummy <-> real env-var substitution server-side. Uses only Node built-ins.

'use strict';

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { Writable, PassThrough } = require('node:stream');
const { URL } = require('node:url');

const brokerUrlStr = process.env.VC_ENV_PROXY_URL;
if (!brokerUrlStr) {
  // No broker URL injected — nothing to do.
  return;
}

const broker = new URL(brokerUrlStr);
const sessionId = process.env.VC_ENV_PROXY_SESSION || '';
const tcpBrokerPort = process.env.VC_ENV_PROXY_TCP_PORT || broker.port || 80;
const hostAliases = (() => {
  try {
    return JSON.parse(process.env.VC_ENV_PROXY_HOST_ALIASES || '{}');
  } catch {
    return {};
  }
})();

// Save originals BEFORE patching, so the broker call itself doesn't recurse.
const origHttpRequest = http.request.bind(http);
const origHttpsRequest = https.request.bind(https);
const origNetConnect = net.connect.bind(net);
const origSocketConnect = net.Socket.prototype.connect;
const origTlsConnect = tls.connect.bind(tls);
const origFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

const DUMMY_HOST_RE = /^vproxy-[a-z0-9-]+-[0-9a-f]{20}\.xx$/;

function postEnvelope(envelope, callback) {
  const json = Buffer.from(JSON.stringify(envelope), 'utf-8');
  const req = origHttpRequest({
    method: 'POST',
    hostname: broker.hostname,
    port: broker.port || 80,
    path: '/proxy',
    headers: {
      'content-type': 'application/json',
      'content-length': json.length,
      'x-vproxy-session': sessionId,
    },
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      try {
        const reply = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        if (res.statusCode >= 400) {
          callback(new Error(`broker error ${res.statusCode}: ${reply.error || ''}`));
        } else {
          callback(null, reply);
        }
      } catch (e) {
        callback(e);
      }
    });
  });
  req.on('error', callback);
  req.end(json);
}

function normalizeHeaders(rawHeaders) {
  const out = {};
  if (!rawHeaders) return out;
  if (Array.isArray(rawHeaders)) {
    for (let i = 0; i < rawHeaders.length; i += 2) {
      out[String(rawHeaders[i]).toLowerCase()] = String(rawHeaders[i + 1]);
    }
    return out;
  }
  if (typeof rawHeaders.forEach === 'function' && typeof rawHeaders.get === 'function') {
    rawHeaders.forEach((v, k) => { out[k.toLowerCase()] = v; });
    return out;
  }
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (Array.isArray(v)) out[k.toLowerCase()] = v.join(', ');
    else if (v != null) out[k.toLowerCase()] = String(v);
  }
  return out;
}

function parseNetConnectArgs(args) {
  let options = {};
  let callback;

  if (typeof args[0] === 'object') {
    options = { ...args[0] };
    callback = typeof args[1] === 'function' ? args[1] : undefined;
  } else {
    options = {
      port: args[0],
      host: typeof args[1] === 'string' ? args[1] : undefined,
    };
    callback =
      typeof args[1] === 'function'
        ? args[1]
        : typeof args[2] === 'function'
          ? args[2]
          : undefined;
  }

  return { options, callback };
}

function setupTcpTunnel(socket, host, port, callback) {
  socket.once('connect', () => {
    socket.write(`${sessionId}\t${host}\t${port}\n`);
  });

  if (callback) {
    socket.once('connect', callback);
  }

  return socket;
}

function connectTcpThroughBroker(host, port, callback) {
  const socket = origNetConnect({
    host: broker.hostname,
    port: tcpBrokerPort,
  });
  return setupTcpTunnel(socket, host, port, callback);
}

function patchNetConnect() {
  function patchedConnect(...args) {
    const { options, callback } = parseNetConnectArgs(args);
    const host = options.host || options.hostname || 'localhost';
    const port = Number(options.port);
    if (typeof host === 'string' && DUMMY_HOST_RE.test(host) && Number.isInteger(port)) {
      return connectTcpThroughBroker(host, port, callback);
    }
    return origNetConnect(...args);
  }

  net.connect = patchedConnect;
  net.createConnection = patchedConnect;
  net.Socket.prototype.connect = function patchedSocketConnect(...args) {
    const { options, callback } = parseNetConnectArgs(args);
    const host = options.host || options.hostname || 'localhost';
    const port = Number(options.port);
    if (typeof host === 'string' && DUMMY_HOST_RE.test(host) && Number.isInteger(port)) {
      setupTcpTunnel(this, host, port, callback);
      return origSocketConnect.call(this, {
        host: broker.hostname,
        port: tcpBrokerPort,
      });
    }
    return origSocketConnect.apply(this, args);
  };
}

function realHostFor(host) {
  return typeof host === 'string' ? hostAliases[host] : undefined;
}

function patchTlsConnect() {
  tls.connect = function patchedTlsConnect(...args) {
    if (args[0] && typeof args[0] === 'object') {
      const options = { ...args[0] };
      const realServername = realHostFor(options.servername);
      const realHost = realHostFor(options.host || options.hostname);
      if (realServername) {
        options.servername = realServername;
      } else if (!options.servername && realHost) {
        options.servername = realHost;
      }
      if (realHost && !options.socket) {
        options.host = realHost;
        options.hostname = realHost;
      }
      return origTlsConnect(options, ...args.slice(1));
    }

    if (typeof args[1] === 'string') {
      const realHost = realHostFor(args[1]);
      if (realHost) {
        const nextArgs = [...args];
        nextArgs[1] = realHost;
        return origTlsConnect(...nextArgs);
      }
    }

    return origTlsConnect(...args);
  };
}

// Build a fake ClientRequest. Looks enough like the real thing for the common
// callers (http.get/request, node-fetch, axios default adapter).
function fakeRequest(protocol, urlString, method, headers) {
  const bodyChunks = [];
  const writable = new Writable({
    write(chunk, enc, cb) {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
      cb();
    },
  });

  writable.setHeader = (k, v) => { headers[k.toLowerCase()] = String(v); };
  writable.getHeader = (k) => headers[k.toLowerCase()];
  writable.removeHeader = (k) => { delete headers[k.toLowerCase()]; };

  // Defer the broker call until end() has flushed.
  writable.on('finish', () => {
    const body = Buffer.concat(bodyChunks);
    postEnvelope({
      method,
      url: urlString,
      headers,
      bodyBase64: body.length ? body.toString('base64') : '',
    }, (err, reply) => {
      if (err) {
        writable.emit('error', err);
        return;
      }
      const res = new PassThrough();
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
    });
  });

  return writable;
}

function parseHttpRequestArgs(defaultProtocol, args) {
  let url;
  let options;
  let callback;
  let i = 0;
  if (typeof args[0] === 'string' || (args[0] && args[0] instanceof URL)) {
    url = new URL(args[0].toString());
    i = 1;
  }
  if (args[i] && typeof args[i] === 'object' && !(args[i] instanceof URL)) {
    options = args[i];
    i++;
  }
  if (typeof args[i] === 'function') {
    callback = args[i];
  }
  options = options || {};

  if (!url) {
    const protocol = options.protocol || defaultProtocol;
    const host = options.hostname || options.host || 'localhost';
    const port = options.port ?? (protocol === 'https:' ? 443 : 80);
    const path = options.path || '/';
    url = new URL(`${protocol}//${host}:${port}${path}`);
  }
  const method = (options.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(options.headers);
  if (!headers.host) headers.host = url.host;
  return { url: url.toString(), method, headers, callback };
}

function patchHttpModule(mod, defaultProtocol) {
  const original = mod.request;
  mod.request = function patchedRequest(...args) {
    const { url, method, headers, callback } = parseHttpRequestArgs(defaultProtocol, args);
    const req = fakeRequest(defaultProtocol, url, method, headers);
    if (callback) req.once('response', callback);
    return req;
  };
  mod.get = function patchedGet(...args) {
    const req = mod.request(...args);
    req.end();
    return req;
  };
  return original;
}

patchHttpModule(http, 'http:');
patchHttpModule(https, 'https:');
patchNetConnect();
patchTlsConnect();

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body, 'utf-8');
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body.arrayBuffer === 'function') {
    return Buffer.from(await body.arrayBuffer());
  }
  if (typeof body.getReader === 'function') {
    const chunks = [];
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(body), 'utf-8');
}

// Replace built-in fetch (undici-backed) with a version that uses the broker.
if (origFetch && typeof globalThis.Response === 'function') {
  globalThis.fetch = async function patchedFetch(input, init = {}) {
    const urlString = typeof input === 'string'
      ? input
      : input && input.url ? input.url : String(input);
    const method = (init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const headers = normalizeHeaders(init.headers || (typeof input === 'object' && input?.headers));

    const body = init.body ?? (typeof input === 'object' && input?.body);
    const bodyBuf = await bodyToBuffer(body);

    return new Promise((resolve, reject) => {
      postEnvelope({
        method,
        url: urlString,
        headers,
        bodyBase64: bodyBuf.length ? bodyBuf.toString('base64') : '',
      }, (err, reply) => {
        if (err) return reject(err);
        const resBody = reply.bodyBase64
          ? Buffer.from(reply.bodyBase64, 'base64')
          : Buffer.alloc(0);
        resolve(new globalThis.Response(resBody, {
          status: reply.status,
          statusText: reply.statusMessage || '',
          headers: reply.headers || {},
        }));
      });
    });
  };
}
