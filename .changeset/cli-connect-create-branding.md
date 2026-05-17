---
'vercel': minor
---

Add `--icon`, `--background-color`, and `--accent-color` flags to `vercel connect create`. The icon is uploaded to Vercel before the connector is created. When the API requires a browser registration step, branding is appended to the dashboard URL so the create form can prefill itself; the CLI also applies a follow-up PATCH after the browser flow as a safety net for the dashboard rollout. Gated behind the existing `FF_CONNEX_ENABLED` flag.
