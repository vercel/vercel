---
'@vercel/build-utils': patch
---

Improve memory efficiency in `FileBlob.fromStream()` by avoiding unnecessary buffer copies when chunks are already Buffers
