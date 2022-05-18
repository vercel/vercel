import "#internal/nitro/virtual/polyfill";
import { requestHasBody, useRequestBody } from "../utils.mjs";
import { nitroApp } from "../app.mjs";
import { isPublicAssetURL } from "#internal/nitro/virtual/public-assets";
addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (isPublicAssetURL(url.pathname) || url.pathname.includes("/_server/")) {
    return;
  }
  event.respondWith(handleEvent(url, event));
});
async function handleEvent(url, event) {
  let body;
  if (requestHasBody(event.request)) {
    body = await useRequestBody(event.request);
  }
  const r = await nitroApp.localCall({
    event,
    url: url.pathname + url.search,
    host: url.hostname,
    protocol: url.protocol,
    headers: event.request.headers,
    method: event.request.method,
    redirect: event.request.redirect,
    body
  });
  return new Response(r.body, {
    headers: r.headers,
    status: r.status,
    statusText: r.statusText
  });
}
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
