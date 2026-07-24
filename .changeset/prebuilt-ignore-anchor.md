---
'@vercel/client': patch
---

Root-anchor the prebuilt deploy ignore negations so files under `.vercel` other than `.vercel/output` are not accidentally re-included when a positive `.vercel` pattern was compiled earlier in the same process (e.g. an in-process `vercel build`).
