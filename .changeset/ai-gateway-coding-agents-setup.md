---
'vercel': minor
---

Add `vercel ai-gateway coding-agents setup` to connect Claude Code to the AI Gateway from an existing API key (`--key`): it sets the gateway base URL and authentication in `~/.claude/settings.json` (honoring `CLAUDE_CONFIG_DIR`), never pins a default model, is idempotent, masks the key in output, skips unparseable configs instead of clobbering them, edits existing config files in place so your own keys and formatting are untouched, and emits a structured JSON result in non-interactive mode.
