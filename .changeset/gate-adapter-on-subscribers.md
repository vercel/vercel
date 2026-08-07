---
'@vercel/python': patch
---

Only inject and activate the queue adapter when the project declares `[[tool.vercel.subscribers]]`, instead of for any project depending on Celery or Dramatiq.
