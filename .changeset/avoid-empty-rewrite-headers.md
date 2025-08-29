---
"@vercel/next": patch
---

Avoid setting an empty `rewrite.headers` in Next.js server build to satisfy routing-utils schema (`minProperties: 1`). This prevents validation failures when no path/query headers are added.

