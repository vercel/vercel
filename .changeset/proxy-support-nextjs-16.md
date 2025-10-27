---
"@vercel/next": patch
---

Support proxy.ts in Next.js 16+ and suppress middleware warnings

Adds support for the new proxy.ts file format introduced in Next.js 16, while maintaining backward compatibility with middleware.ts. The builder now checks for proxy.ts first in Next.js 16+, falls back to middleware.ts, and suppresses unnecessary warnings when neither file exists. This ensures vercel.json function configurations are properly applied to proxy.ts files.
