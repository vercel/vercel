---
'vercel': patch
---

`ai-gateway coding-agents setup` now detects the Codex desktop app and asks for consent before configuring Codex, since the desktop app cannot use custom model providers and stops working when one is set (the Codex CLI keeps working). Non-interactive and `--yes` runs configure Codex only when it is explicitly requested with `--agent`/`--all`; JSON output gains a `warnings` array and a `requires_consent` skip reason, and a run refused for lack of consent exits 1 with a self-contained `requires_consent` error payload (structured warnings, skip entries, and a runnable `next[]` command). A declined agent's configuration is left untouched.
