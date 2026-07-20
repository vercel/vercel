---
'@vercel/build-utils': patch
'@vercel/next': patch
'@vercel/static-build': patch
'vercel': patch
---

Propagate per-function `maxConcurrency` configuration into build outputs and keep every configured Next.js route in its own Lambda group, including routes with the same limit.
