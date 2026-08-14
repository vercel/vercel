---
'@vercel/python-runtime': minor
---

Report the cold start phase breakdown as server timings.

The `bootstrap`, `import-fn` and `server-ready` phases are now reported on the
first response through `x-vercel-internal-timing`, the same channel and names the
Node bridge uses, instead of a `phases` field on the `server-started` handshake.
`userInitDuration` continues to be reported on the handshake.
