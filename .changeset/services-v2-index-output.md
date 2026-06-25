---
'@vercel/backends': patch
'@vercel/go': patch
'@vercel/python': patch
'vercel': patch
---

Simplify isolated `services` and `experimentalServicesV2` runtime outputs by emitting their function at `index` instead of `_svc/<service-name>/index`.
