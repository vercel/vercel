---
'vercel': patch
---

Add Pi support to `vercel ai-gateway coding-agents setup`. It writes the gateway credential to Pi's native `vercel-ai-gateway` auth entry in `~/.pi/agent/auth.json` (created `0600`, honoring `PI_CODING_AGENT_DIR`) without pinning a default model.
