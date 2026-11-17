---
'@vercel/connect': patch
---

Keep cached Connect tokens fetched with different `vercelToken` credentials apart, so a process that calls Connect for several teams or projects never receives another credential's token. `deleteTokenCacheEntry` accepts an optional `{ vercelToken }` to drop only that credential's entry; without it, it drops the matching entry for every credential. `getTokenResponse` now throws a `ConnectError` when a successful response is not JSON or is missing `token` or `expiresAt`, and does not cache it.
