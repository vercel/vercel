---
"vercel": patch
---

fix(cli): `vercel logs --expand` now shows all log entries per request

Previously, `fetchRequestLogs` mapped each API row to a single
`RequestLogEntry` by reading only `row.logs?.[0]`. All subsequent
`console.log` / `console.warn` calls within the same serverless invocation
were silently discarded.

The transform now uses `flatMap` to expand every entry in `row.logs` into
its own `RequestLogEntry`, so `vercel logs --expand` shows the complete
output that matches the Vercel dashboard.

Fixes #15711
