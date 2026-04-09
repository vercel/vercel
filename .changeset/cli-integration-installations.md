---
vercel: minor
---

Extend marketplace integration CLI parity: add `vercel integration installations` to list team installations (with optional `--integration` filter and JSON output), align `vercel integration update` argument parsing with other subcommands (parse only tokens after `update`, so the integration slug is the first positional), and ship related help/telemetry updates.
