// Blocks all outbound network connections except to localhost.
// Loaded via NODE_OPTIONS="--require ./block-network.js" to ensure
// CLI integration tests only talk to the local Prism mock server.
'use strict';

const net = require('net');

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

const origConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (...args) {
  let host;

  const first = args[0];
  if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
    // connect(options[, callback])
    host = first.host;
  } else if (typeof first === 'number') {
    // connect(port[, host[, callback]])
    if (typeof args[1] === 'string') {
      host = args[1];
    }
  }
  // connect(path[, callback]) — Unix sockets are always allowed

  if (host && !ALLOWED_HOSTS.has(host)) {
    const err = new Error(
      `[cli-integration] External network blocked: "${host}". ` +
        'All API requests must route through the mock server ($VERCEL_MOCK_API).'
    );
    err.code = 'ENETWORK_BLOCKED';
    process.nextTick(() => this.destroy(err));
    return this;
  }

  return origConnect.apply(this, args);
};
