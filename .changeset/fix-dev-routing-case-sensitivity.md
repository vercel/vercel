---
'vercel': patch
---

Fix `vercel dev` always matching routes case-sensitively for legacy configs

`hasNewRoutingProperties` compared `typeof value !== undefined` (the value) instead of `!== 'undefined'` (the string). `typeof` always returns a string, so every comparison was true and the function always returned `true`, forcing case-sensitive route matching in `vercel dev` even for legacy `routes`-only configs (which should match case-insensitively).
