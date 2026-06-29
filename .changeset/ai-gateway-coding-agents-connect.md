---
'vercel': minor
---

Add `vercel ai-gateway coding-agents connect` to connect local coding agents to the AI Gateway. This change ships the command framework and Claude Code support; Codex, OpenCode, and Pi are added in follow-up changes.

For each selected agent it configures only the gateway's base URL and authentication — it never pins a default model, so you keep choosing your own. It provisions a new API key (or reuses one with `--key`); a new key supports an optional name (`--name`), spend limit (`--budget` / `--refresh-period` / `--include-byok`), and expiry (`--expiration` `7d|30d|60d|90d|1y|none`).

Interactively it asks which agents to connect (pre-selecting the ones detected locally), then the key's name, team, quota, and expiry, shows the planned changes and a summary, and asks before applying. `--yes` runs without prompts using the detected agents and defaults; `--dry-run` previews without writing; existing files are backed up (`.bak`) and unparseable configs are skipped rather than clobbered. A `--non-interactive` run emits a structured JSON result. The full key is never printed — only a masked form.

Config locations follow each agent's own conventions: it honors their native relocation env vars (e.g. `CLAUDE_CONFIG_DIR`) and `ZDOTDIR`/fish for the shell rc. For bespoke setups you can override any agent's config file with `--agent-config <id>=<path>` (repeatable) and the shell rc with `--shell-rc <path>`; interactively it offers a custom path when an agent isn't found at its default location. Adding a new agent is a single module under `util/ai-gateway/coding-agents/agents`.
