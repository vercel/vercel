---
'vercel': patch
---

Add an experimental Cline agent to `vercel ai-gateway coding-agents setup`. Writes Cline's first-party `vercel-ai-gateway` provider entry in `~/.cline/data/settings/providers.json` (the same 0600 file `cline auth` manages), preserving any existing schema version and provider entries. Select it explicitly with `--agent cline`.
