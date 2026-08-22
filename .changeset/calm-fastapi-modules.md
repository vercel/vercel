---
'@vercel/python': patch
---

Import FastAPI entrypoints with normal Python module semantics during static
frontend CDN discovery so package-relative imports work.
