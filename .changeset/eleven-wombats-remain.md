---
'@vercel/functions': patch
---

Replace truthy check in InMemoryCache.get() with a null check so that zero ttl values don't persist indefinitely.
