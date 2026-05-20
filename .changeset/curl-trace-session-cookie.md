---
'vercel': minor
---

`vercel curl --trace` now sends the `_vercel_session` cookie alongside the trace cookie, scopes the session API call via query parameters, sends `hostname` instead of `deploymentId`, and parses the request id from the `x-vercel-id` response header.
