---
'vercel': patch
---

Add `--triggers` flag to `vercel connex create`, gated behind `FF_CONNEX_TRIGGERS=1`. When both are set, the CLI includes `triggers: { enabled: true }` in the managed-create request body so the server wires incoming webhook triggers into the created client. The flag is not declared when the env var is unset, so `--triggers` is rejected as an unknown option in that case. Internal/experimental — paired with the server-side `connex-triggers` LaunchDarkly flag.
