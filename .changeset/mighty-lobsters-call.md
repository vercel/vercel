---
'@vercel/functions': minor
---

`getCache().set()` now defaults `options.name` to the provided `key` when omitted, so cache entries get a human-readable label in o11y by default. Pass `name: ''` to suppress this behavior and use the hashed key.
