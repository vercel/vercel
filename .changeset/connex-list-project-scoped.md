---
'vercel': minor
---

`vercel connex list` now defaults to clients linked to the current project. When no project is linked, it falls back to listing every Connex client in the team (same as `--all-projects`). Use `--all-projects` to force the team-wide view; the table includes a `Projects` column with the linked project names per client (with a `+ more` suffix when truncated).
