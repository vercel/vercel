---
'vercel': patch
---

Add OpenAPI-driven subcommand fallback behind `VERCEL_AUTO_API=1`.

When the env var is set, unrecognized CLI tokens are matched against OpenAPI tags and operation IDs from `openapi.vercel.sh`. This enables `vercel <tag> <operationId>` (e.g. `vercel user getAuthUser`) at the top level, and per-command fallthrough (e.g. `vercel projects getProject`) when a token doesn't match a native subcommand.

When `x-vercel-cli.displayColumns` is present in the OpenAPI response schema, results render as a card (single object) or table (array) instead of raw JSON.
