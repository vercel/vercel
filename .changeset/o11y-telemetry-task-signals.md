---
'vercel': patch
---

Record task-outcome telemetry: final deployment state, runtime-log match presence, a fingerprint of the invocation's structural shape (command token, argument count, flag names — hashed with a local-only salt that is never transmitted), and an opaque UUID from `AI_AGENT_TASK_ID`. Gated behind `VERCEL_CLI_TELEMETRY_V2`.
