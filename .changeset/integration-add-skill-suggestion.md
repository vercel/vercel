---
'vercel': patch
---

[cli] `integration add` now installs a product's declared agent skills after provisioning. It reads the product's `agentSkills` (public GitHub `SKILL.md` links) and normalizes each to `npx skills add <repo-url> --skill <name>`. Install is the default: in an interactive terminal it prompts first (default yes); non-interactive callers (agents, CI) can't be prompted, so they proceed with the default and auto-install via `npx --yes skills add`. `--format=json` stays read-only — it never installs and instead surfaces a `skills` array (each entry tagged `kind: "agent-skill"`). Non-GitHub or unparseable entries are skipped.
