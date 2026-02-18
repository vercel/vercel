---
"vercel": patch
---

Fix `vercel install` (alias `vercel i`) to forward all flags (`--name`, `--metadata`, `--plan`, `--no-connect`, `--no-env-pull`) to `integration add` and propagate the exit code
