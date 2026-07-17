---
'vercel': patch
---

Resolve explicit help requests (`vercel <cmd> --help`, `vercel help <cmd>`) before configuration or authentication setup, so help stays available when either is broken and regardless of where global flags appear in the invocation. Command help keeps the usage exit code `2` and bare `vercel --help` keeps `0`, matching previous behavior. Help invocations handled by this early path no longer emit help telemetry events or the update notification, and invalid nested command paths still fall through to the router's usage errors.
