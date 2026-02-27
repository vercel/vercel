---
'@vercel/fs-detectors': patch
---

Fix dynamic routes with [id] segments returning 404 on Vercel (CLI-152). When Next.js is the frontend, do not add the catch-all `^/api(/.*)?$` → 404 rewrite, so App Router API routes like `/api/blog/posts/[id]` are handled by Next.js instead of being 404'd by zero-config routes.
