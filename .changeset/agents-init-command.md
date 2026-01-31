---
'vercel': minor
---

Add `vercel agents init` command to generate AI agent configuration files (AGENTS.md, .cursorrules, etc.) with Vercel deployment best practices.

Features:
- New `vercel agents init` command that generates agent-specific configuration files
- Auto-detection of AI agents (Cursor, Claude Code, Gemini, Codex, Devin, Replit)
- Framework-aware content generation (Next.js, Remix, Astro, SvelteKit, Nuxt, and more)
- Documentation for Vercel services: Cron Jobs, Blob Storage, KV, Postgres, Edge Functions, and Marketplace integrations
- Surfaces existing vercel.json configuration in generated files
- Automatic generation triggered by `vercel deploy`, `vercel link`, `vercel build`, and `vercel env pull` when an AI agent is detected
- Support for multiple output formats: markdown (AGENTS.md), cursorrules (.cursorrules), and copilot (.github/copilot-instructions.md)
- Opt-out via `VERCEL_AGENT_FILES_DISABLED=1` environment variable

Usage:
```bash
# Generate agent files (auto-detects format based on agent)
vercel agents init

# Generate all supported formats
vercel agents init --format=all

# Preview without writing files
vercel agents init --dry-run

# Overwrite existing files
vercel agents init --force
```
