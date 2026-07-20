---
'@vercel/next': patch
---

Fixes Cache Component prerendering behavior for fallback shells so they do not prerender params that were inteded to be always-dynamic
