---
'@vercel/connect': patch
---

Add an opt-in `validate` flag to the Eve `connect()` adapter (backed by a new `forceRefresh` option on `getToken`/`getTokenResponse`). When set, each `getToken` bypasses the in-process token cache and re-checks Vercel Connect, so a grant the user revoked server-side surfaces as an authorization-required prompt instead of being served as a stale, still-cached bearer.
