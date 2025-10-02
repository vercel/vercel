---
'@vercel/functions': patch
---

Add configurable timeout to BuildCache to fail faster on gateway timeouts

The BuildCache client now includes a configurable timeout (default 500ms) for all fetch requests to prevent indefinite hangs on 502/504 gateway timeouts. The timeout can be configured via the `RUNTIME_CACHE_TIMEOUT`
environment variable or passed directly to the BuildCache constructor. When a timeout occurs, the request is aborted and the error is logged via the onError callback.
