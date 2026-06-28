---
'vercel': minor
---

Add `vercel ai-gateway coding-agents connect` to connect local coding agents (Claude Code, Codex, OpenCode, Pi) to the AI Gateway.

For each selected agent it configures only the gateway's base URL and authentication — it never pins a default model, so you keep choosing your own. It provisions a new API key (or reuses one with `--key`); a new key supports an optional name (`--name`), spend limit (`--budget` / `--refresh-period` / `--include-byok`), and expiry (`--expiration` `7d|30d|60d|90d|1y|none`).

Interactively it asks which agents to connect (pre-selecting the ones detected locally), then the key's name, team, quota, and expiry, shows the planned changes and a summary, and asks before applying. `--yes` runs without prompts using the detected agents and defaults; `--dry-run` previews without writing; existing files are backed up (`.bak`) and unparseable configs are skipped rather than clobbered. A `--non-interactive` run emits a structured JSON result.

On macOS the key is stored in the login Keychain (Codex and Claude Code resolve it from the shell at runtime) instead of being written into config files; pass `--no-keychain`, or run off macOS, to embed it directly. The full key is never printed — only a masked form. Adding a new agent is a single module under `util/ai-gateway/coding-agents/agents`.
