---
'vercel': patch
---

Add a `--base-url` flag to `vercel ai-gateway coding-agents setup` to point Codex and Claude Code at a different AI Gateway base URL (e.g. a preview deployment). When set, the value is written verbatim into each agent's config, so you own correctness when mixing API styles in one run.

Codex and Claude Code now default to their gateway compatibility endpoints — `https://ai-gateway.vercel.sh/codex/v1` and `https://ai-gateway.vercel.sh/claude-code` (Anthropic style, no `/v1`) — instead of the generic gateway URLs. Claude Code's settings also set `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` so it discovers the gateway's model catalog. OpenCode and Pi are unaffected — they use their native gateway providers.
