---
'vercel': patch
'@vercel/error-utils': patch
---

Fixed `TypeError: fetch failed` on newer Node.js versions (e.g. Node 26) when `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` is set, by routing proxied requests through the CLI's bundled `undici` `fetch()` instead of the runtime's native `fetch` (whose internal `undici` major version may not accept a dispatcher built from a different `undici` major). Also surfaced `Error#cause` in CLI error output instead of silently discarding it.
