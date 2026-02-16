---
'@vercel/build-utils': patch
'@vercel/client': patch
'@vercel/go': patch
'@vercel/node': patch
'@vercel/static-build': patch
'vercel': patch
---

Remove `node-fetch` dependency and use the built-in `fetch` API instead.
