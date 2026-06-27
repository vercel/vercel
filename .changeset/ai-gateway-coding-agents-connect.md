---
'vercel': minor
---

Add `vercel ai-gateway setup-coding-agents` to configure local coding agents (Claude Code, Codex, OpenCode, Pi) to route through the AI Gateway. The command provisions or reuses a Gateway API key (with optional `--budget` / `--refresh-period`), writes each agent's config file, shows a masked diff of what changes, backs up existing files, and supports interactive and non-interactive (`--non-interactive`, agent-detected) modes plus `--dry-run`. Adding new agents is a single module under `util/ai-gateway/coding-agents/agents`.
