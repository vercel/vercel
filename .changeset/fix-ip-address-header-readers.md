---
'@vercel/functions': patch
---

Fix `ipAddress` throwing for header readers with an internal `headers` property, such as the Next.js headers adapter.
