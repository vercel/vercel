---
'@vercel/rust': minor
---

Fix `vercel dev` instability with the Rust runtime by allocating a unique free port per dev server instance. Previously the dev server relied on the `vercel_runtime` crate's fixed default port, which caused intermittent "address already in use" failures (surfacing as `Process exited before completing request`) when `vercel dev` restarted the server between requests. The runtime now passes a `VERCEL_DEV_PORT`, waits for the process to exit during shutdown so the port is released, and reports a clear error on port collisions instead of silently falling back to lambda invocation. The shutdown grace period now also allows the runtime's dev-mode `waitUntil` drain to complete before force-killing, so background work registered via `waitUntil` runs as expected under `vercel dev`.
