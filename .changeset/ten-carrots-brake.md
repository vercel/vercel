---
'vercel': minor
---

Adds experimental support for embedding Vercel Flags definitions during build.

When `VERCEL_BUILD_EMIT_FLAG_DEFINITIONS=1` is set, the CLI scans environment variables for Vercel Flags SDK keys (prefixed with `vf_`) and fetches their flag definitions. The definitions are written to a synthetic `@vercel/flags-definitions` module in `node_modules` that can be imported at runtime.
