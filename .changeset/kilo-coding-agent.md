---
'vercel': patch
---

Add an experimental Kilo Code agent to `vercel ai-gateway coding-agents setup`. Writes an `openai-compatible` provider to `~/.config/kilo/kilo.json` using Kilo's `{env:AI_GATEWAY_API_KEY}` substitution so the key never lands in the file; the model picker auto-populates from the gateway's `/v1/models`. Select it explicitly with `--agent kilo`.
