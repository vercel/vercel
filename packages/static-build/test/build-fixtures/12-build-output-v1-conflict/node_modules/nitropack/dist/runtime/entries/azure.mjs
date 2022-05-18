import "#internal/nitro/virtual/polyfill";
import { parseURL } from "ufo";
import { nitroApp } from "../app.mjs";
export async function handle(context, req) {
  let url;
  if (req.headers["x-ms-original-url"]) {
    url = parseURL(req.headers["x-ms-original-url"]).pathname;
  } else {
    url = "/api/" + (req.params.url || "");
  }
  const { body, status, statusText, headers } = await nitroApp.localCall({
    url,
    headers: req.headers,
    method: req.method,
    body: req.body
  });
  context.res = {
    status,
    headers,
    body: body ? body.toString() : statusText
  };
}
