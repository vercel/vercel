---
'@vercel/next': patch
---

Fix build trace lookups missing on Windows

`getBuildTraceFile()` looks pages up in maps keyed by `glob()` output, which is
always POSIX, but App Router paths are derived with `path.relative()` and so use
backslashes on Windows. Every lookup missed there, and each page was re-traced
from scratch with `nodeFileTrace` instead of reusing the `.nft.json` emitted by
the build.
