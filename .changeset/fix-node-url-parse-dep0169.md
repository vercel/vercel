---
"@vercel/node": patch
---

fix(node): replace deprecated `url.parse()` with WHATWG URL API to silence DEP0169 deprecation warning on cold starts
