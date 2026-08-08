---
'vercel': patch
---

Add an experimental Hermes agent to `vercel ai-gateway coding-agents setup`. Writes a gateway provider to `~/.hermes/config.yaml` using `key_env` (the key stays in the shell environment) with model auto-discovery enabled. Select it explicitly with `--agent hermes`.
