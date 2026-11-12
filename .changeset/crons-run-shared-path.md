---
'vercel': patch
---

Fix `vercel crons run` submitting the first schedule when multiple cron jobs share a path. The interactive picker now runs the selected schedule, and passing an ambiguous path now fails with an error instead of silently picking the first match.

Add a `--schedule` option to `vercel crons run` so a specific schedule can be chosen non-interactively when several cron jobs share a path.
