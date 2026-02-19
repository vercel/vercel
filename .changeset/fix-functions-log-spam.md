---
"@vercel/functions": patch
---

fix(functions): migrate to after() API for pool maintenance on Next.js 15.1+

Added support for the Next.js `after()` API introduced in Next.js 15.1 for database pool maintenance. The `after()` API provides a more stable and reliable way to schedule post-response work compared to direct `waitUntil` usage.

This fix:
- Prefers `after()` when available (Next.js 15.1+) for pool release handling
- Falls back to `waitUntil` for older Next.js versions or non-Next.js environments
- Suppresses the "Pool release event triggered outside of request scope" warning unless DEBUG is enabled

Fixes #14825
