---
'vercel': patch
---

Improve `vercel blob list-stores` with `--json` and `--no-projects`, exclude non-blob stores when the API returns a `type` field, and show a richer table for non-TTY output while keeping linked-project filtering, `--all`, and interactive store selection on TTY.
