---
'vercel': patch
---

When `FF_CONNEX_TRIGGERS=1` is set, `vercel connex create` now includes `triggers: { enabled: true }` in the managed-create request body so the server wires incoming webhook triggers into the created client. No user-facing flag; stealth behavior paired with the server-side `connex-triggers` LaunchDarkly flag. Internal/experimental.
