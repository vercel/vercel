---
'vercel': minor
---

Stream `vercel logs --follow` from project request logs so live follow works across deployments with `--environment`, `--branch`, and `--no-branch`. Follow `--json` now emits typed `request_started` / `log` / `request_finished` events instead of raw runtime-log rows.
