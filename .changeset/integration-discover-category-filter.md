---
'vercel': patch
---

Add `--category` / `-c` filter to `vercel integration discover` to scope marketplace integrations to a single category (e.g. `storage`, `ai`, `monitoring`). Filtering happens server-side; the CLI passes the slug through as a query param.
