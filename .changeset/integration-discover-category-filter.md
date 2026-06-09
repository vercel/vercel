---
'vercel': patch
---

Add `--category` / `-c` filter to `vercel integration discover` and a new `vercel integration categories` subcommand. The filter scopes marketplace integrations to a single category (e.g. `storage`, `ai`, `monitoring`) — filtering happens server-side. The new `categories` subcommand lists the valid slugs (`Slug | Title` table or `--json` for scripts/agents).
