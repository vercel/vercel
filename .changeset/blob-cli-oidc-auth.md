---
'vercel': patch
---

Add OIDC auth support to `vercel blob` commands. When `VERCEL_OIDC_TOKEN` and `BLOB_STORE_ID` are set in the environment (or `.env.local`), the CLI uses them as the default credential source. The `--rw-token` flag remains exclusive — when provided, it always wins and never falls back to OIDC.
