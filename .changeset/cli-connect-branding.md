---
'vercel': minor
---

Add `vercel connect update <id>` subcommand to change connector branding. Accepts `--icon` (PNG or JPEG path, uploaded to Vercel and sent as SHA-1), `--background-color`, and `--accent-color` (both `#RRGGBB`). Gated behind the existing `FF_CONNEX_ENABLED` flag.
