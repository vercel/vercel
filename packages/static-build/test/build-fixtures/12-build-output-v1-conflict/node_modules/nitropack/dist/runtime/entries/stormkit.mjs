import "#internal/nitro/virtual/polyfill";
import { withQuery } from "ufo";
import { nitroApp } from "../app.mjs";
export const handler = async function handler2(event, context) {
  const url = withQuery(event.path, event.queryStringParameters || {});
  const method = event.httpMethod || "get";
  const r = await nitroApp.localCall({
    event,
    url,
    context,
    headers: event.headers,
    method,
    query: event.queryStringParameters,
    body: event.body
  });
  return {
    statusCode: r.status,
    headers: normalizeOutgoingHeaders(r.headers),
    body: r.body.toString()
  };
};
function normalizeOutgoingHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
}
