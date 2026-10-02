---
'@vercel/passport': major
---

Expose `getPassportToken()` from the main module for explicitly forwarding the current request's Passport token from Vercel request context. The accessor has no cookie or development-token fallback and does not verify claims. Existing identity verification helpers remain available.
