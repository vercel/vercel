---
'vercel': minor
---

Add `vercel connex attach <client>` to attach a Vercel project to a Connex client for one or more environments. Defaults to the current linked project + all environments (`production`, `preview`, `development`). Pass `-e/--environment` (repeatable, comma-separated) to restrict, `-p/--project <name_or_id>` to target a different project, and `--yes` / `--format=json` for non-interactive use. When the project is already attached with the same environments, the command exits early as a no-op; when the environments differ, the prompt shows a current-vs-new diff before replacing.
