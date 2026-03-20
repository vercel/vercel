---
'vercel': patch
---

Auto-install agent tooling on `vercel login`, `vercel link`, and `vercel deploy`. When a supported agent platform (Claude Code, Cursor) is detected or the user has `~/.claude`/`~/.cursor` directories, prompts to install the Vercel plugin. On `vercel link`, also prompts to add Vercel best practices to AGENTS.md/CLAUDE.md. On `vercel deploy`, shows a non-blocking tip if the plugin is not installed. User preferences are persisted to avoid repeat prompts.
