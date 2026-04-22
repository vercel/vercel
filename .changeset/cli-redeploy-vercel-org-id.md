---
"vercel": patch
---

Fix `vercel redeploy` to honor `VERCEL_ORG_ID` environment variable for team context. Previously, `redeploy` only used `getScope()` which resolves the default team, ignoring `VERCEL_ORG_ID`. This caused "Not authorized" errors in CI workflows that rely on env-var-based team configuration. The command now reads `VERCEL_ORG_ID` before resolving scope, consistent with `vercel list`, `vercel deploy`, and other commands. Fixes #16073.
