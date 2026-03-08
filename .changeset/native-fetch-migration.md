---
'vercel': patch
'@vercel/client': patch
'@vercel/build-utils': patch
'@vercel/static-build': patch
'@vercel/go': patch
'@vercel/node': patch
'@vercel/frameworks': patch
---

Remove direct `node-fetch` usage in favor of Node's native `fetch` across the repo.
