// Injected by @vercel/static-build into Nitro lambda functions.
//
// Nitro v3 exports a Web Fetch API handler ({ fetch(req, context) }).
// Nitro v2 exports a Node.js HTTP handler ((req, res) => void).
// The export below handles both shapes by introspecting the original handler.
import { timingSafeEqual as __vc_timingSafeEqual } from 'node:crypto';
import __vc_original from './index.mjs';

function safeBearerEqual(authHeader, secret) {
  if (typeof authHeader !== 'string') return false;
  const expected = 'Bearer ' + secret;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return __vc_timingSafeEqual(a, b);
}

function isCronPath(path) {
  return path.startsWith('/_nitro/tasks/');
}

function checkCronSecret(authorization) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return safeBearerEqual(authorization, secret);
}

// Nitro v3: Web Fetch API handler ({ fetch(req, context) })
function vcDispatchV3(req, context) {
  const url = new URL(req.url);

  if (isCronPath(url.pathname)) {
    if (!checkCronSecret(req.headers.get('authorization'))) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Vercel crons invoke via GET; rewrite to POST for Nitro's task endpoint.
    if (req.method === 'GET') {
      req = new Request(req.url, { headers: req.headers, method: 'POST' });
    }
  }

  return __vc_original.fetch(req, context);
}

// Nitro v2: Node.js HTTP handler ((req, res) => void)
function vcDispatchV2(req, res) {
  const path = (typeof req.url === 'string' ? req.url : '/').split('?')[0];

   if (isCronPath(path)) {
    if (!checkCronSecret(req.headers.authorization)) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    // Vercel crons invoke via GET; rewrite to POST for Nitro's task endpoint.
    if (req.method === 'GET') {
      req.method = 'POST';
    }
  }

  return __vc_original(req, res);
}

export default typeof __vc_original?.fetch === 'function'
  ? { fetch: vcDispatchV3 }
  : vcDispatchV2;
