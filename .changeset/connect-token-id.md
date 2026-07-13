---
'@vercel/connect': patch
---

Expose and document the per-issuance `tokenId` on `ConnectTokenResponse` (returned by `getToken`/`getTokenResponse`). It's a stable identifier for the issued token — new on each issuance/refresh — for correlating a token with its usage in Vercel observability/billing data.
