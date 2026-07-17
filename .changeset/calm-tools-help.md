---
'vercel': patch
---

Resolve explicit help requests (`vercel <cmd> --help`, `vercel help <cmd>`) before configuration or authentication setup, so help stays available when either is broken and regardless of where global flags appear in the invocation. Explicit help now exits `0` (command help previously exited `2`): help is a successful operation, and `2` stays reserved for invalid or missing command structure, continuing the exit-code cleanup from #13780. Help invocations handled by this early path no longer emit help telemetry events or the update notification, and invalid nested command paths still fall through to the router's usage errors.
