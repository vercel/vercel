---
'vercel': minor
---

`vercel env pull` now keeps variables that only exist in the local env file instead of deleting them. Kept variables are listed in the command output. CLI-managed variables (`VERCEL_OIDC_TOKEN` and analytics IDs) are still removed when they no longer exist upstream.
