---
'@vercel/python-runtime': minor
---

Add private invocation hooks: Vercel-owned integrations can register work
that runs off the request's critical path once request-scoped credentials
exist, with per-name deduplication, optional re-run intervals, and failure
backoff.
