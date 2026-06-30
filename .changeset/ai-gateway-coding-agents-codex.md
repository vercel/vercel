---
'vercel': patch
---

Add Codex support to `vercel ai-gateway coding-agents setup`. It writes a `vercel` model provider to `~/.codex/config.toml` (OpenAI-compatible base URL, `responses` wire API) without pinning a default model, and exports the gateway API key via your shell rc (honoring `CODEX_HOME` and fish/`ZDOTDIR`). Merging into an existing `config.toml` edits assignments in place, preserving your comments and formatting.
