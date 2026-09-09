---
'vercel': patch
---

Pass the CLI invocation id to the bundled `sandbox` CLI via `VERCEL_CLI_INVOCATION_ID` so its telemetry can be joined back to the `vercel sandbox` invocation.
