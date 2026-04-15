---
'@vercel/cli': patch
---

Improve `vc logs` by flattening nested request log lines into the default text output so each row reflects the actual per-log message and level, while preserving the existing request-oriented JSON output and removing the redundant `--expand` flag.
