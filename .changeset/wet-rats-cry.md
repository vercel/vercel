---
'@vercel/functions': minor
---

`getCache().get()` now defaults `options.name` to the provided `key` when omitted, so GET requests show a human-readable label in o11y instead of the raw hashed `itemId`. Pass `name: ''` to suppress this behavior and use the hashed key.
