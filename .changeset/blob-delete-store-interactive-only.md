---
'vercel': minor
---

Remove `--yes` from `vercel blob delete-store`. Deleting a Blob store cannot be undone, so it now always requires interactive confirmation and can no longer be run non-interactively (CI, scripts, or agents).
