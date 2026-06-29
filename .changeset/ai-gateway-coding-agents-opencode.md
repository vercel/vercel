---
'vercel': patch
---

Add OpenCode support to `vercel ai-gateway coding-agents connect`. It supplies the gateway API key to OpenCode's native `vercel` provider in `~/.config/opencode/opencode.json` (honoring `XDG_CONFIG_HOME`) without pinning a default model.
