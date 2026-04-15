---
'vercel': patch
---

Add `vercel api <tag> <operationId>` as an alternative to raw paths: resolves the OpenAPI operation (exact `operationId`, case-insensitive) and routes key=value parameters to path, query, headers, or body from the spec.

Running `vercel api <tag>` alone (no operationId) lists operations for that tag when the OpenAPI spec matches.
