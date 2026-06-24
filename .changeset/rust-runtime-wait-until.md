---
---

Add `waitUntil` support to the `vercel_runtime` Rust crate. Background futures registered via `AppState::wait_until` are spawned immediately and drained at process shutdown (SIGTERM), bounded by a 30s timeout, mirroring the Node.js runtime's behavior. The per-request `end` IPC message is unchanged and is never delayed by background work.
