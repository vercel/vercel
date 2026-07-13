---
'vercel': patch
---

`ai-gateway coding-agents setup` now previews before it writes. `--dry-run` and the pre-apply summary show the planned per-file changes as a masked diff, the resolved key/quota/expiry, and the `.bak` backups it would create (suppressed with `--no-backup`), then ask for confirmation before applying. For non-standard setups, `--agent-config <id>=<path>` overrides an agent's config-file location and `--shell-rc <path>` the shell rc; interactively it offers a custom path when an agent isn't found at its default location.
