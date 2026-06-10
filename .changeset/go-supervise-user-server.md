---
'@vercel/go': patch
---

[go] Supervise the user server after startup in standalone server mode. If the user's server process exits after the `server-started` handshake, the bootstrap now reports an `unrecoverable-error` over IPC and exits with the child's exit code, so the platform can recycle the instance instead of leaving it serving 502s while the health check still reports OK.
