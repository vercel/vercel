---
'@vercel/connect': patch
---

Add a targeted `deleteTokenCacheEntry(connector, params)` export that drops a single in-process token cache entry, and wire it into the Eve `connect()` adapter as an `evict()` hook. When Eve rejects a resolved bearer (a downstream `401` mapped to `requireAuth()`, or an MCP server rejecting the token) it now cascades invalidation from its own per-step cache down into the Connect adapter's cache, so the next `getToken` performs a genuine refresh instead of re-serving the revoked-but-unexpired token. The `evict()` hook also accepts an opt-in `revoke: true` to tear the grant down at Vercel Connect (refresh token included) for user-initiated disconnects; revocation is best-effort and falls back to a local cache drop on failure.
