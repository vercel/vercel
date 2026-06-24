---
'@vercel/backends': patch
'@vercel/build-utils': patch
'vercel': patch
---

Fix `vercel dev` for standalone Node servers, including projects without a `package.json`, and reuse the server process between requests.
