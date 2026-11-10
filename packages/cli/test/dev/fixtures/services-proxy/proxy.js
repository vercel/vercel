import { next } from '@vercel/functions';

export default function proxy(request) {
  const url = new URL(request.url);
  if (url.pathname === '/from-proxy') {
    return new Response('hi from proxy');
  }
  // Fall through to the routed service. A `proxy` entrypoint runs on the
  // Node.js runtime, which — unlike the edge runtime — does not turn an empty
  // return into `x-middleware-next`, so the fall-through must be explicit.
  // TODO: return nothing here once the Node.js runtime synthesizes the
  // fall-through for an empty middleware return, matching the edge runtime.
  return next();
}
