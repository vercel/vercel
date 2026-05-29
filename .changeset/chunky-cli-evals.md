---
'vercel': patch
---

Split CLI eval result uploads into size-limited multipart requests to avoid centralized ingest payload limits.
