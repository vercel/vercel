---
'vercel': minor
---

`vercel crons ls` now reports the next and previous scheduled run for each cron job. The default table adds `Next Run` and `Previous Run` columns rendered as relative times (e.g. `in 30m`, `2h ago`), and `--format json` adds `nextRun` / `previousRun` ISO 8601 UTC timestamps on every entry under `crons` and `undeployed`. Times are computed locally from the schedule expression, so this works without any new API calls. Schedules that fail to parse fall back to `null` (JSON) or `—` (table) instead of crashing.
