---
'@vercel/client': major
'@vercel/build-utils': patch
'vercel': patch
---

Migrate `@vercel/client` and `@vercel/build-utils` from `node-fetch` to native `fetch`. This removes the last `url.parse()` usage from the CLI bundle, which triggered a `DEP0169` DeprecationWarning on Node 24 (visible in the standalone binary during `vercel deploy`).

BREAKING CHANGE (`@vercel/client`): the `agent?: http.Agent` option was replaced with `dispatcher?: FetchDispatcher` (an undici dispatcher, e.g. `undici.ProxyAgent`), since native `fetch` does not support Node.js HTTP agents. The CLI now threads its proxy-aware dispatcher through automatically, so `HTTP_PROXY`/`HTTPS_PROXY` behavior is unchanged for CLI users.
