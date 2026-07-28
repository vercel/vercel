---
'@vercel/build-utils': patch
---

Preserve 4-byte UTF-8 characters when streaming string `FileBlob` contents (fixes Edge Function corruption during `vercel build`).
