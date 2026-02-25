---
'@vercel/static-build': patch
'@vercel/build-utils': patch
'vercel': patch
'@vercel/go': patch
---

Rename fetch to nodeFetch in cases where it is an import from node-fetch
