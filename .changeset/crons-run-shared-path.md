---
'vercel': patch
---

Fix `vercel crons run` submitting the first schedule when multiple cron jobs share a path. The interactive picker now runs the selected schedule, and passing an ambiguous path now fails with an error instead of silently picking the first match.
