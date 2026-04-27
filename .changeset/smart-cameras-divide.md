---
'vercel': patch
---

Prevent non-interactive command suggestions from ever echoing auth tokens. The CLI now strips `--token` / `-t` flags (including inline `=value` forms) before building `next.command` payloads, so automation output cannot leak credentials copied from invocation args.
