---
'@vercel/backends': patch
---

Fix introspection stdout truncation for payloads larger than the pipe buffer (~64 KiB).
