---
'vercel': patch
'@vercel/routing-utils': patch
'@vercel/fs-detectors': patch
---

Enable `cleanUrls` by default for builds and `vercel dev`. Projects can opt out with `"cleanUrls": false` in `vercel.json`.
