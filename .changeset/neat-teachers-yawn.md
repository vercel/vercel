---
'@vercel/fs-detectors': patch
---

Fix `detectBuilders` so projects using experimental backends still add `@vercel/static` for `public/**/*` files.
