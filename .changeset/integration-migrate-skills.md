---
'vercel': minor
---

Add `vercel integration migrate-skills`, which replaces Neon Marketplace agent skills that the CLI auto-installed into a project with Vercel's maintained version: it updates `neon-postgres` to the Vercel-maintained mirror and removes the deprecated `neon` skill. The command discloses exactly what it will change and prompts before applying; in non-interactive contexts it prints the commands and makes no changes unless `--yes` is passed.
