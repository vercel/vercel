---
'vercel': patch
---

Change how files are uploaded for the `blob` commands. Before we were reading
files fully in memory and then sending them to the Vercel Blob API. We will now
stream files from disk to the Vercel Blob API, avoiding the need to read them
all in memory and making the upload more efficient.
