---
'@vercel/python-runtime': minor
'@vercel/python': patch
---

Report a cold start phase breakdown from the Python runtime.

The `server-started` handshake now includes `userInitDuration` and a `phases`
breakdown (`bootstrap`, `importFn`, `serverReady`), and `initDuration` is
measured from a timestamp stamped by the generated handler before it does any
work, so it covers the `vercel_runtime` import chain and the user code import
instead of starting after them.
