---
'@vercel/build-utils': patch
'@vercel/config': patch
'@vercel/static-build': patch
vercel: patch
---

Add support for `functions[*].functionFailoverRegions` in `vercel.json` and build output config generation.

This enables per-function failover region configuration instead of only top-level defaults for all functions.
