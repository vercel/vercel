---
'vercel': minor
---

Add `vercel connex link <client>` to link a Vercel project to a Connex client for one or more environments. Defaults to the linked project + all environments (`production`, `preview`, `development`). Pass `-e/--environment` (repeatable, comma-separated) to restrict, `-p/--project <name_or_id>` to target a different project, and `--yes` / `--format=json` for non-interactive use. When the link already exists, the prompt shows the current vs new environments before replacing.
