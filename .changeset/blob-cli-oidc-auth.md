---
'vercel': patch
---

Add OIDC auth support to `vercel blob` commands and upgrade `@vercel/blob` to `2.4.0`. When `VERCEL_OIDC_TOKEN` and `BLOB_STORE_ID` are set in the environment (or `.env.local`), or when `--oidc-token` and `--store-id` are passed together, the CLI uses them as the credential source. The `--rw-token` flag remains exclusive — when provided, it always wins and never falls back to OIDC. The OIDC token is now forwarded to the SDK via the native `oidcToken` option (added in `@vercel/blob` 2.4.0) rather than by mutating `process.env`.
