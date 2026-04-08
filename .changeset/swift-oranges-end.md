---
'vercel': patch
---

Improve `vc logs` ergonomics by showing `vc logs --help` when invalid flags are provided, exiting successfully for explicit `--help`, and preserving the full nested `logs[]` array in JSON output so all request log messages remain available.
