//
// Unified Lambda handler for bundled vanilla API routes.
// All bundleable lambdas share this handler (same handler digest).
// It reads x-matched-path to determine which entrypoint to invoke.
//
// At build time the builder replaces the VERCEL_ENTRYPOINT_PREFIX env lookup
// with the actual prefix string. The x-matched-path header is set by
// route rules injected by the builder.
//
// This runs at Lambda runtime where the handler is invoked with (req, res).
// User modules are in the Lambda's file tree alongside this file.
//
// Supports all handler shapes:
//   1. Function export:  module.exports = (req, res) => { ... }
//   2. Web handlers:     export function GET(request) { ... }
//   3. Fetch handler:    export function fetch(request) { ... }
//   4. Server handler:   http.createServer(...).listen()
//

const http = require('http');
const { existsSync } = require('fs');
const { resolve } = require('path');
const { pathToFileURL } = require('url');
const { Readable } = require('stream');

const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

const handlerCache = Object.create(null);

// At build time the builder replaces the token below with the actual prefix.
const entrypointPrefix = process.env.VERCEL_ENTRYPOINT_PREFIX;

function getEntrypointCandidates(entrypoint) {
  const candidates = [entrypoint];

  if (typeof entrypointPrefix === 'string' && entrypointPrefix) {
    candidates.push(entrypointPrefix + '/' + entrypoint);
  }

  return candidates;
}

/**
 * Resolve an extensionless entrypoint to an actual file path.
 * Tries common JS extensions in order, returning the first match.
 */
function resolveEntrypoint(name) {
  const base = resolve('./' + name);
  for (const ext of ['.js', '.cjs', '.mjs']) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  // If base is a directory, look for index files inside it
  if (existsSync(base)) {
    for (const ext of ['.js', '.cjs', '.mjs']) {
      const p = resolve(base, 'index' + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Load a module via dynamic import(). Works for both CJS and ESM regardless
 * of the file extension or the package.json "type" field.
 */
async function loadModule(filePath) {
  return import(pathToFileURL(filePath).href);
}

/**
 * Unwrap nested default exports (common with TS/ESM compiled to CJS).
 */
function unwrapDefaults(mod) {
  for (let i = 0; i < 5; i++) {
    if (mod && mod.default) mod = mod.default;
    else break;
  }
  return mod;
}

/**
 * Create a Node.js (req, res) handler from web handler exports (GET, POST, fetch, etc.).
 * Uses Node.js 18+ built-in Web API globals (Request, Response).
 */
function createWebHandler(listener) {
  const methods = Object.create(null);

  // If fetch is exported, it handles all methods
  if (typeof listener.fetch === 'function') {
    for (const m of HTTP_METHODS) {
      methods[m] = listener.fetch;
    }
  }

  // Named method exports override fetch
  for (const m of HTTP_METHODS) {
    if (typeof listener[m] === 'function') {
      methods[m] = listener[m];
    }
  }

  return async (req, res) => {
    const method = req.method || 'GET';
    const fn = methods[method];
    if (!fn) {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    // Build a Web API Request from the Node.js IncomingMessage
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `${proto}://${host}`);

    const init = { method, headers: req.headers, duplex: 'half' };
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = Readable.toWeb(req);
    }

    const request = new Request(url, init);
    let response;
    try {
      response = await fn(request);
    } catch {
      res.statusCode = 500;
      res.end('Internal Server Error');
      return;
    }

    // Write the Web API Response back to the Node.js ServerResponse
    res.statusCode = response.status;
    for (const [key, value] of response.headers) {
      res.appendHeader(key, value);
    }

    if (response.body) {
      for await (const chunk of response.body) {
        res.write(chunk);
      }
    }
    res.end();
  };
}

/**
 * Compile a user module and return a (req, res) handler regardless of
 * export shape. Mirrors the detection logic in serverless-handler.mts.
 */
async function compileUserCode(filePath) {
  let server = null;
  let serverFound;

  // Monkey-patch http.Server.prototype.listen to capture server instances
  // created during module import (e.g. Express apps calling app.listen()).
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function () {
    server = this;
    http.Server.prototype.listen = originalListen;
    if (serverFound) serverFound();
    return this;
  };

  try {
    let listener = await loadModule(filePath);
    listener = unwrapDefaults(listener);

    // 1. Web handlers (GET, POST, fetch, etc.)
    const isWebHandler =
      HTTP_METHODS.some(m => typeof listener[m] === 'function') ||
      typeof listener.fetch === 'function';

    if (isWebHandler) {
      return createWebHandler(listener);
    }

    // 2. Function handler: (req, res) => { ... }
    if (typeof listener === 'function') {
      return listener;
    }

    // 3. Server handler: http.createServer(...).listen()
    //    Wait briefly for async server creation if not captured yet.
    if (!server) {
      await new Promise(r => {
        serverFound = r;
        setTimeout(r, 1000);
      });
    }

    if (server) {
      // Start the captured server on a random port and proxy requests to it.
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const { port } = server.address();

      return (req, res) => {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: req.headers['x-forwarded-host'] || req.headers.host,
            },
          },
          proxyRes => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', err => {
          res.statusCode = 502;
          res.end('Proxy error: ' + err.message);
        });
        req.pipe(proxyReq);
      };
    }

    throw new Error(
      "Can't detect handler export shape for " +
        filePath +
        '. Expected a function export, HTTP method exports (GET, POST, ...), or an http.Server.'
    );
  } finally {
    http.Server.prototype.listen = originalListen;
  }
}

module.exports = async (req, res) => {
  const matchedPath = req.headers['x-matched-path'];
  if (typeof matchedPath !== 'string' || !matchedPath) {
    res.statusCode = 500;
    res.end(
      'Missing x-matched-path header. The bundled handler requires route-level header injection.'
    );
    return;
  }

  // Convert matched path to entrypoint name.
  // x-matched-path "/" maps to "index", "/api/hello" maps to "api/hello".
  const entrypoint = matchedPath.replace(/^\//, '') || 'index';

  if (!handlerCache[entrypoint]) {
    let filePath = null;
    for (const candidate of getEntrypointCandidates(entrypoint)) {
      filePath = resolveEntrypoint(candidate);
      if (filePath) {
        break;
      }
    }

    if (!filePath) {
      res.statusCode = 404;
      res.end('No handler found for ' + entrypoint);
      return;
    }
    // Store the Promise immediately so concurrent requests to the same
    // entrypoint share one compileUserCode() call instead of racing.
    handlerCache[entrypoint] = compileUserCode(filePath).catch(err => {
      delete handlerCache[entrypoint]; // Allow retry on next request
      throw err;
    });
  }

  const handler = await handlerCache[entrypoint];
  return handler(req, res);
};
