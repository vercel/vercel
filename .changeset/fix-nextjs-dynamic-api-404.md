---
'@vercel/fs-detectors': patch
---

Fix App Router dynamic API routes returning 404 in production. When a project has both Next.js (App Router) and a root `api/` folder, zero-config added a catch-all `^/api(/.*)?$` → 404 in the filesystem phase, which runs before the rewrite phase where Next.js routes live. So requests like `/api/flow/hello/next` or `/api/blog/posts/5` matched the catch-all and never reached the Next.js route. When Next.js is the frontend we no longer add that rewrite so those routes are handled by Next.js. (Locally, only `next dev` worked; `vc dev` had the same 404.)
