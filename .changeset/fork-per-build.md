---
'vercel': patch
---

Run each builder's `build()` in a forked child process during `vercel build`. This isolates each build's stdout/stderr and environment, so build output can be captured (and later attributed per service), and lays the groundwork for parallel builds. Builders that can't cross a process boundary — the built-in `@vercel/static`, and builds that register a pre-deploy or build callback — continue to run in-process.
