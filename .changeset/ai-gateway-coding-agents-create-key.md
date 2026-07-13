---
'vercel': patch
---

`ai-gateway coding-agents setup` can now **provision a key** for you: run it without `--key` and it creates an AI Gateway API key (prompting for the owning team and a name, or using `--name`/`--scope` and the current scope with `--yes`), then writes that key into the agent configs.

Re-running when everything is already set up is no longer a dead end: it prompts to **rotate the key or switch team**, and `--reconfigure` does the same non-interactively (useful for a rotated or expired key, or a different org). A plain re-run stays a no-op.
