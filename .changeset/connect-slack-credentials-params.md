---
'@vercel/connect': patch
---

Allow `connectSlackCredentials` to forward `ConnectTokenParams` (e.g. `installationId`, `scopes`, `validityBufferMs`) and `ConnectOptions` through to `getToken`. The `subject` field stays pinned to `{ type: 'app' }` so the helper still enforces app-scoped Slack bot tokens.
