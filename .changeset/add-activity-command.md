---
'vercel': minor
---

feat(cli): add `activity` command to list audit events

- New `vercel activity` command to list user/team audit events from the Events API
- Supports filtering by event type (`--type`), time range (`--since`/`--until`), and project (`--project`)
- `activity types` subcommand to list available event types
- Auto-scopes to linked project; `--all` for team-wide events
- Pagination via `--limit`/`--next` and JSON output via `--format json`
