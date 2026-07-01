---
'@vercel/oidc': minor
'@vercel/oidc-aws-credentials-provider': minor
---

Cache exchanged OIDC tokens in memory, keyed by a hash of the source token, audience, and jti, so repeated exchanges reuse the result instead of calling the token-exchange endpoint every time. Cached tokens are evicted when the API-provided expiry passes, and the cache is bounded with least-recently-used eviction to avoid unbounded growth. Add a `skipCache` option (surfaced as `skipTokenCache` on `awsCredentialsProvider`) to bypass the cache. `jti` and the cache-skip flags are now only accepted alongside an `audience`, since they only take effect during a token exchange.
