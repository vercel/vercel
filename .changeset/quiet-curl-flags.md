---
'vercel': patch
---

Strip already-handled global CLI flags from `vc curl` arguments so options like `--cwd` still set the working directory without being forwarded to the underlying `curl` process.
