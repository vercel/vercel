---
'@vercel/frameworks': patch
'@vercel/express': patch
'@vercel/hono': patch
---

- Expand framework detection to src/app and src/server files.
- Improve handling when multiple entrypoints are detected.
