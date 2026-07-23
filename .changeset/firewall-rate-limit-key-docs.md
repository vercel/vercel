---
'@vercel/firewall': patch
---

Document that `checkRateLimit`'s rate limit key defaults to the caller's IP address, and that providing a custom `rateLimitKey` replaces that IP default (so the bucket is no longer implicitly scoped by IP unless the caller includes it in the key).
