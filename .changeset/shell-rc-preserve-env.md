---
'vercel': patch
---

`vercel ai-gateway coding-agents setup` no longer drops env exports that other agents previously wrote into the managed shell block. A codex-only rerun used to rewrite the block with just its own exports, wiping claude-code's `ANTHROPIC_AUTH_TOKEN` — which silently disabled gateway model discovery in Claude Code.
