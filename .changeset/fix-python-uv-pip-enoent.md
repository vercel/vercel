---
'@vercel/python': patch
---

Fixed `spawn /usr/local/bin/uv ENOENT` error when installing `vercel-runtime` by using an absolute `workPath` as the working directory for `uv pip install` instead of the relative `entryDirectory`.
