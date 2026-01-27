---
'@vercel/client': patch
'vercel': patch
---

Add up to 30 seconds of random skew to APIs returning `Retry-After` headers to prevent thundering herds fighting over a single rate limit token.
