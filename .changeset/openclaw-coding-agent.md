---
'vercel': patch
---

Add an experimental OpenClaw agent to `vercel ai-gateway coding-agents setup`. Writes a `models.providers` entry to `~/.openclaw/openclaw.json` with a `${AI_GATEWAY_API_KEY}` reference OpenClaw resolves itself, plus a starter model list. Select it explicitly with `--agent openclaw`.
