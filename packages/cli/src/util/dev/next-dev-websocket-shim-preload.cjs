'use strict';

const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');

const REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');
const PATCHED_SYMBOL = Symbol.for('@vercel/next-dev-websocket-shim/patched');
const UPGRADE_LISTENER_SYMBOL = Symbol.for(
  '@vercel/next-dev-websocket-shim/upgrade-listener'
);

if (!globalThis[PATCHED_SYMBOL]) {
  globalThis[PATCHED_SYMBOL] = true;

  const requestContext = new AsyncLocalStorage();
  const previousRequestContext = globalThis[REQUEST_CONTEXT_SYMBOL];

  Object.defineProperty(globalThis, REQUEST_CONTEXT_SYMBOL, {
    enumerable: false,
    configurable: true,
    value: {
      get: () => requestContext.getStore() ?? previousRequestContext?.get?.(),
    },
  });

  const originalEmit = http.Server.prototype.emit;
  const originalListen = http.Server.prototype.listen;

  http.Server.prototype.listen = function listen(...args) {
    if (!this[UPGRADE_LISTENER_SYMBOL]) {
      this[UPGRADE_LISTENER_SYMBOL] = true;
      this.on('upgrade', noop);
    }

    return originalListen.apply(this, args);
  };

  http.Server.prototype.emit = function emit(
    event,
    req,
    socket,
    head,
    ...args
  ) {
    if (
      event !== 'upgrade' ||
      !isWebSocketUpgrade(req) ||
      isNextInternalUpgrade(req)
    ) {
      return originalEmit.call(this, event, req, socket, head, ...args);
    }

    const requestListeners = this.listeners('request');
    if (requestListeners.length === 0) {
      return originalEmit.call(this, event, req, socket, head, ...args);
    }

    const response = new http.ServerResponse(req);

    return emitWebSocketRequest({
      server: this,
      req,
      response,
      socket,
      head: head || Buffer.alloc(0),
      requestContext,
      originalEmit,
    });
  };
}

function emitWebSocketRequest({
  server,
  req,
  response,
  socket,
  head,
  requestContext,
  originalEmit,
}) {
  socket.setTimeout(0);
  socket.setNoDelay(true);

  if (typeof response.assignSocket === 'function' && !response.socket) {
    response.assignSocket(socket);
  }

  const abortController = new AbortController();
  let consumed = false;
  const context = {
    waitUntil: promiseOrFunc => {
      const promise =
        typeof promiseOrFunc === 'function' ? promiseOrFunc() : promiseOrFunc;
      Promise.resolve(promise).catch(() => {});
    },
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(',') : value,
      ])
    ),
    method: req.method || 'GET',
    url: new URL(req.url || '/', getRequestOrigin(req)).toString(),
    signal: abortController.signal,
    upgradeWebSocket: () => {
      if (consumed) {
        throw new Error(
          'ctx.upgradeWebSocket() can only be called once per request'
        );
      }
      consumed = true;

      if (typeof response.detachSocket === 'function') {
        response.detachSocket(socket);
      }
      suppressFrameworkResponse(response);
      preserveAsyncContextOnSocket(socket, requestContext);

      socket.once('close', () => {
        requestContext.run(context, () => {
          req.emit('aborted');
          abortController.abort();
        });
      });
      socket.once('error', noop);

      return { req, socket, head };
    },
  };

  requestContext.run(context, () => {
    try {
      originalEmit.call(server, 'request', req, response);
    } catch (error) {
      socket.destroy(error);
    }
  });

  return true;
}

function isWebSocketUpgrade(req) {
  const connection = req?.headers?.connection;
  const upgrade = req?.headers?.upgrade;
  return (
    typeof connection === 'string' &&
    connection
      .split(',')
      .some(token => token.trim().toLowerCase() === 'upgrade') &&
    typeof upgrade === 'string' &&
    upgrade.split(',').some(token => token.trim().toLowerCase() === 'websocket')
  );
}

function isNextInternalUpgrade(req) {
  const pathname = new URL(req?.url || '/', 'http://localhost').pathname;
  return pathname.includes('/_next/') || pathname.startsWith('/__nextjs');
}

function suppressFrameworkResponse(response) {
  response.writeHead = function writeHead() {
    return this;
  };
  response.write = function write() {
    return true;
  };
  response.end = function end() {
    return this;
  };
}

function preserveAsyncContextOnSocket(socket, requestContext) {
  const store = requestContext.getStore();
  const runInSnapshot =
    typeof AsyncLocalStorage.snapshot === 'function'
      ? AsyncLocalStorage.snapshot()
      : callback => requestContext.run(store, callback);
  const originalEmit = socket.emit;
  socket.emit = function emit(...args) {
    return runInSnapshot(() => originalEmit.apply(this, args));
  };
}

function getRequestOrigin(req) {
  const host = req.headers.host || 'localhost';
  const proto = req.socket?.encrypted ? 'https' : 'http';
  return `${proto}://${host}`;
}

function noop() {}
