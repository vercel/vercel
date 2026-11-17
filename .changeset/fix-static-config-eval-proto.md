---
'@vercel/static-config': patch
---

Replace `eval()` with `getLiteralValue()` and harden object property assignment against `__proto__` in `@vercel/static-config`.
