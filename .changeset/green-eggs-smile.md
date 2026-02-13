---
'@vercel/go': patch
'@vercel/ruby': patch
---

Forward Go and Ruby dev server output through `startDevServer` stdout/stderr callbacks so service logs are correctly prefixed in multi-service `vercel dev`.
