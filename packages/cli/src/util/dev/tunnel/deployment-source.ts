/**
 * Source for the proxy deployment that `vc dev --tunnel` creates.
 *
 * Emitted as strings rather than shipped files because the CLI publishes only
 * `dist`, and esbuild bundles TypeScript — string constants survive both
 * without touching the build.
 *
 * The deployment is the rendezvous point: one function both holds the CLI's
 * WebSocket and serves every request, forwarding each over that socket. The
 * socket lives in module scope, so it is only reachable from the instance that
 * accepted the upgrade; a request landing anywhere else gets 503 and the client
 * retries. See TUNNEL_NO_CLIENT_STATUS.
 */

/** Path the CLI opens its WebSocket against. */
export const TUNNEL_CONNECT_PATH = '/__tunnel';

/** Returned when this instance is not the one holding the socket. */
export const TUNNEL_NO_CLIENT_STATUS = 503;

/** Env var carrying the shared secret the CLI mints per deployment. */
export const TUNNEL_SECRET_ENV = 'TUNNEL_SECRET';

const FUNCTION_SOURCE = String.raw`
const { experimental_upgradeWebSocket } = require('@vercel/functions');
const { randomUUID } = require('node:crypto');

const SECRET = process.env.TUNNEL_SECRET || '';
const CONNECT_PATH = '__TUNNEL_CONNECT_PATH__';
const NO_CLIENT_STATUS = __TUNNEL_NO_CLIENT_STATUS__;
const REQUEST_TIMEOUT_MS = 30000;

// Only set on the instance that accepted the upgrade. Fluid keeps module scope
// alive between invocations, which is what makes this reachable at all.
let client = null;
const pending = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function settle(id, fn) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  fn(entry);
}

function attach(ws) {
  client = ws;

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'response') {
      settle(msg.id, entry => entry.resolve(msg));
    } else if (msg.type === 'error') {
      settle(msg.id, entry => entry.reject(new Error(msg.message || 'tunnel client error')));
    }
  });

  const drop = () => {
    if (client === ws) client = null;
    for (const id of [...pending.keys()]) {
      settle(id, entry => entry.reject(new Error('tunnel client disconnected')));
    }
  };
  ws.on('close', drop);
  ws.on('error', drop);
}

function forward(req, bodyBuffer) {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settle(id, entry => entry.reject(new Error('tunnel request timed out')));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });

    client.send(
      JSON.stringify({
        type: 'request',
        id,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: bodyBuffer.length ? bodyBuffer.toString('base64') : undefined,
      })
    );
  });
}

module.exports = async function handler(req, res) {
  const isUpgrade = String(req.headers.upgrade || '').toLowerCase() === 'websocket';
  const path = (req.url || '/').split('?')[0];

  if (isUpgrade) {
    if (path !== CONNECT_PATH) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    // Constant-time-ish: lengths differ far more often than contents.
    if (!SECRET || token !== SECRET) {
      res.statusCode = 401;
      res.end();
      return;
    }
    await experimental_upgradeWebSocket(attach);
    return;
  }

  if (!client || client.readyState !== 1) {
    res.statusCode = NO_CLIENT_STATUS;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'no tunnel client on this instance' }));
    return;
  }

  let reply;
  try {
    reply = await forward(req, await readBody(req));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String((err && err.message) || err) }));
    return;
  }

  res.statusCode = reply.status || 200;
  for (const [k, v] of Object.entries(reply.headers || {})) {
    // Hop-by-hop headers would corrupt the response if replayed.
    if (['connection', 'transfer-encoding', 'keep-alive', 'upgrade'].includes(k.toLowerCase())) {
      continue;
    }
    res.setHeader(k, v);
  }
  res.end(reply.body ? Buffer.from(reply.body, 'base64') : undefined);
};
`.trimStart();

/** Files to write into the temp dir that gets deployed. */
export function tunnelDeploymentFiles(): Record<string, string> {
  return {
    'api/tunnel.js': FUNCTION_SOURCE.replace(
      '__TUNNEL_CONNECT_PATH__',
      TUNNEL_CONNECT_PATH
    ).replace('__TUNNEL_NO_CLIENT_STATUS__', String(TUNNEL_NO_CLIENT_STATUS)),

    'package.json': `${JSON.stringify(
      {
        name: 'vc-dev-tunnel',
        private: true,
        dependencies: {
          // experimental_upgradeWebSocket() landed in 3.7.0.
          '@vercel/functions': '^3.9.0',
          ws: '8.18.0',
        },
      },
      null,
      2
    )}\n`,

    // Every path reaches the one function, so the socket and the traffic share
    // an instance whenever the router reuses it.
    'vercel.json': `${JSON.stringify(
      {
        functions: { 'api/tunnel.js': { maxDuration: 300 } },
        rewrites: [{ source: '/(.*)', destination: '/api/tunnel' }],
      },
      null,
      2
    )}\n`,
  };
}
