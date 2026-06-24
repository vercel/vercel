---
'vercel': patch
---

[cli] `integration add` now suggests `npx skills add …` commands for a product's declared agent skills. After provisioning, it reads the product's `agentSkills` (public GitHub `SKILL.md` links), normalizes each to a ready-to-run `npx skills add <repo-url> --skill <name>` command, and prints them (and surfaces them as a `skills` array in `--format=json`). Non-GitHub or unparseable entries are skipped, and the CLI only suggests the command — running `npx skills add` is left to the user/agent.
