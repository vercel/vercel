---
'@vercel/functions': patch
---

Add configurable timeout to RuntimeCache with sensible default to fail faster on gateway timeouts

The RuntimeCache client now includes a configurable timeout (default 500ms) for all fetch requests to prevent indefinite hangs on 502/504 gateway timeouts. 
The timeout can be configured at build time via the `RUNTIME_CACHE_TIMEOUT` environment variable. When a timeout occurs, the request is aborted and the
error is logged via the onError callback.
