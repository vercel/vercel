import "#internal/nitro/virtual/polyfill";
import { nitroApp } from "../app.mjs";
import { requestHasBody, useRequestBody } from "../utils.mjs";
export default async function(request, _context) {
  const url = new URL(request.url);
  let body;
  if (requestHasBody(request)) {
    body = await useRequestBody(request);
  }
  const r = await nitroApp.localCall({
    url: url.pathname + url.search,
    host: url.hostname,
    protocol: url.protocol,
    headers: request.headers,
    method: request.method,
    redirect: request.redirect,
    body
  });
  return new Response(r.body, {
    headers: r.headers,
    status: r.status,
    statusText: r.statusText
  });
}
