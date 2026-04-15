---
vercel: patch
---

Return 3xx responses directly in `client.fetch()` when `redirect: 'manual'` is passed, instead of entering the error/retry path.
