---
'vercel': patch
---

fix(cli): Scope DELETE confirmation prompt to `vercel api` command only

This fixes a regression from #14769 where the DELETE confirmation prompt was incorrectly applied to all DELETE operations (e.g., `vercel env rm`, `vercel alias rm`) instead of only the `vercel api` command. Commands like `env rm` and `alias rm` have their own `--yes` flags for confirmation and should not be affected.
