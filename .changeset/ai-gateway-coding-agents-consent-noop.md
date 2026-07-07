---
'vercel': patch
---

`ai-gateway coding-agents setup` no longer fails a non-interactive or `--yes` re-run when every selected agent needs consent but the existing configuration already uses the AI Gateway: the run reports `already_configured` instead, so automation does not start failing once a desktop app or login appears. Dry runs on an all-skipped selection now predict the real outcome — no changes, a Keychain-only key refresh, or the exact `--agent` flags a real run would need.
