---
'vercel': patch
---

`ai-gateway coding-agents setup` now configures only the agents detected on the machine when run non-interactively without `--agent`/`--all`, exits with code 1 (without creating an API key) when no agent configuration can be written, and on Windows reports the environment variable to set instead of writing a shell file that is never loaded (unless `--shell-rc` is passed explicitly). Non-interactive re-runs with `--key` on an already-configured macOS Keychain setup now refresh the stored key instead of silently keeping the old one.
