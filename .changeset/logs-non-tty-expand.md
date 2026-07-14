---
'vercel': patch
---

`vercel logs` now defaults to `--expand` output when stderr is not a TTY (agents, pipes, CI), printing every log message in full instead of truncating messages to a fixed-width table column.
