---
'vercel': patch
---

Add OpenCode support to `vercel ai-gateway coding-agents setup`. It supplies the gateway API key to OpenCode's native `vercel` provider in `~/.config/opencode/opencode.json` (honoring `XDG_CONFIG_HOME`) without pinning a default model. With the macOS Keychain in use, the key is kept out of the config and resolved from `AI_GATEWAY_API_KEY` (exported from the shell rc) at runtime instead.
