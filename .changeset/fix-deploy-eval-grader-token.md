---
'vercel': patch
---

Internal: fix `_deploy` eval grader passing `--token ""` in the Docker sandbox where `VERCEL_TOKEN` isn't in process env. Only pass `--token` when set; CLI falls back to `auth.json` otherwise.
