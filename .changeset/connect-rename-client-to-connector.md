---
"vercel": patch
---

[connect] Rename user-facing "client" references to "connector"

Updates the `vercel connect` CLI commands to use the official "connector" terminology in all user-facing surfaces: help text argument names (remove/attach/detach), usage strings in error messages, and the `--format=json` output key (`clients` → `connectors`) for `vercel connect list`.
