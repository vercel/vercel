---
'vercel': patch
---

Add a generator that produces `skills/vercel-cli` command reference material from the CLI command specs (`pnpm generate-skill-reference`), with a drift check (`pnpm check-skill-reference` and a unit test) and a `CLI_EVAL_SKILLS_DIR` override for the CLI evals skill directory.
