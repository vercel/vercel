import "#internal/nitro/virtual/polyfill";
import { getAssetFromKV, mapRequestToAsset } from "@cloudflare/kv-asset-handler";
import { withoutBase } from "ufo";
import { requestHasBody, useRequestBody } from "../utils.mjs";
import { nitroApp } from "../app.mjs";
import { useRuntimeConfig } from "#internal/nitro";
addEventListener("fetch", (event) => {
  event.respondWith(handleEvent(event));
});
async function handleEvent(event) {
  try {
    return await getAssetFromKV(event, { cacheControl: assetsCacheControl, mapRequestToAsset: baseURLModifier });
  } catch (_err) {
  }
  const url = new URL(event.request.url);
  let body;
  if (requestHasBody(event.request)) {
    body = await useRequestBody(event.request);
  }
  const r = await nitroApp.localCall({
    event,
    url: url.pathname + url.search,
    host: url.hostname,
    protocol: url.protocol,
    headers: Object.fromEntries(event.request.headers.entries()),
    method: event.request.method,
    redirect: event.request.redirect,
    body
  });
  return new Response(r.body, {
    headers: normalizeOutgoingHeaders(r.headers),
    status: r.status,
    statusText: r.statusText
  });
}
function assetsCacheControl(_request) {
  return {};
}
const baseURLModifier = (request) => {
  const url = withoutBase(request.url, useRuntimeConfig().app.baseURL);
  return mapRequestToAsset(new Request(url, request));
};
function normalizeOutgoingHeaders(headers) {
  return Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]);
}
