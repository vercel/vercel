---
'@vercel/fs-detectors': patch
---

Fix Next.js apps not excluding the Node.js builder for middleware when `framework` is `undefined` in the project settings.
