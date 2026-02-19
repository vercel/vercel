---
'@vercel/python': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Add background worker service support for Python (Dramatiq/Celery) and propagate vercel headers context to worker handlers.
