---
"vercel": patch
"@vercel/fs-detectors": patch
"@vercel/python": patch
"@vercel/python-runtime": patch
"@vercel/python-workers": patch
---

[python] update celery worker services declaration to support broker_url="vercel://" instead of having to import from vercel.workers.celery
