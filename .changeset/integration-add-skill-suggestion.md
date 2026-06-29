---
'vercel': patch
---

[cli] `integration add` now installs a product's declared agent skills after provisioning. It reads the product's `agentSkills` (public GitHub `SKILL.md` links) and runs `npx skills add` for each — prompting first in an interactive terminal (default yes), or auto-installing for non-interactive callers (agents, CI). `--format=json` stays read-only: it surfaces a `skills` array instead of installing. Non-GitHub or unparseable links are skipped.
