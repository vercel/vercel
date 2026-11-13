---
'vercel': patch
---

Add `--no-gitignore` flag to `vercel link` and `vercel env pull`.

When passed, the flag skips the automatic write to `.gitignore` that normally happens during these commands (adding `.vercel` for `link`, and `.env*` for `env pull`). Useful in monorepo setups or workflows where `.gitignore` management is handled separately.
