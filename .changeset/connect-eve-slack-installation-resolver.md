---
'@vercel/connect': minor
---

`connectSlackCredentials` now accepts a lazy resolver function as its `params` argument (type `ConnectSlackCredentialsParamsResolver`), enabling context-aware Slack installation selection. A single Eve route can serve multiple Slack workspace installations through the same connector by computing `installationId` from request-scoped context (e.g. `AsyncLocalStorage`) at `botToken()` invocation time. Existing object-params and no-args callers are fully backward compatible.
