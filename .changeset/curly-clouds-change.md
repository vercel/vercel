---
'vercel': minor
---

Add confirmation prompt for DELETE API operations and agent mode warning

- DELETE operations now require user confirmation before proceeding
- When running under an AI agent with `--dangerously-skip-permissions`, a warning is displayed to stderr
- In non-TTY mode, DELETE operations fail unless `--dangerously-skip-permissions` is used
