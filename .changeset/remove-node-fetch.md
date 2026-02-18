---
'vercel': patch
---

Remove `node-fetch` dependency in favor of native `fetch` (Node.js 18+). Proxy support now uses `undici`'s `EnvHttpProxyAgent` as a per-request dispatcher.
