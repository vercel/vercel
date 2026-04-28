---
'vercel': patch
---

Improve CLI unit test portability and argument fixture handling by replacing a POSIX-only `mkdir -p` call with Node's cross-platform `mkdirSync(..., { recursive: true })`, and by passing a token fixture as `--token=<value>` so values beginning with `-` are parsed correctly in non-interactive token tests.
