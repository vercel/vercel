---
'vercel': patch
---

Prevent non-interactive `next.command` suggestions from echoing auth tokens across CLI flows, not just `tokens add`. The CLI now strips `--token` / `-t` flags (including inline `=value` forms) before building suggested rerun commands, so automation output cannot leak credentials copied from invocation args; `VERCEL_TOKEN` from environment variables was not affected.
