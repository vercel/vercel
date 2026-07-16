---
'vercel': patch
---

Fix `vercel dev` returning 404 for `api/` functions using the rust, python, ruby, or go runtimes when the project has a framework dev command (e.g. Next.js). These runtimes are registered by backend framework presets, which caused the dev server to misclassify `api/` functions as the frontend build and skip building them.
