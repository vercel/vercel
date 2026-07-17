---
'vercel': patch
---

Resolve explicit help requests (`vercel <cmd> --help`, `vercel help <cmd>`) before configuration or authentication setup, so help stays available when either is broken and regardless of where global flags appear in the invocation. Explicit help now exits `0` (command help previously exited `2`): help is a successful operation, and `2` stays reserved for invalid or missing command structure, continuing the exit-code cleanup from #13780. Help telemetry (`flag:help` and the `help` command event) is still emitted when the global config is readable and telemetry has been initialized; it is skipped when consent state cannot be determined (unreadable or uninitialized config), and help renders regardless. The update notification is not shown for early-help invocations, and invalid nested command paths still fall through to the router's usage errors.
