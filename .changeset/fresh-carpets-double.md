---
'@vercel/build-utils': patch
'@vercel/config': patch
'vercel': patch
---

Add support for `regions` in `vercel.json` function-level configuration.

Matching function `regions` are now parsed from `functions` config, written into lambda output config, and documented in config types so they override top-level deployment regions for that function.
