---
'vercel': minor
---

Add `--icon`, `--background-color`, and `--accent-color` flags to `vercel connect create` for setting connector branding at creation. The icon is uploaded to the Vercel avatar service before the connector is created; for managed-create flows that require a browser registration step, branding is applied via a follow-up PATCH after the new connector is returned.

Add `vercel connect update <id>` subcommand to change connector branding. Supports the same three flags.

Both gated behind the existing `FF_CONNEX_ENABLED` flag.
