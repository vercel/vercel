---
'vercel': patch
---

Add `vercel teams requests` with `ls`, `approve`, and `reject` actions for managing pending team access requests. The new subcommand supports JSON output and requires `--yes` for `reject` in non-interactive mode.
