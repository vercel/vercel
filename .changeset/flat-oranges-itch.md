---
'@vercel/build-utils': patch
---

Restore `finalizeLambda()` to return `zipPath: null` for the default in-memory path, preserving the existing caller-facing result contract while keeping custom ZIP strategies supported.
