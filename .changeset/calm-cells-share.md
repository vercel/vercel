---
'@vercel/build-utils': patch
'@vercel/next': patch
'@vercel/static-build': patch
'vercel': patch
---

Propagate per-function `maxConcurrency` configuration into build outputs and keep functions with different limits in separate Next.js Lambda groups.
