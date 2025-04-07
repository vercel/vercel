---
'@vercel/next': patch
---

Fix for rewrite headers that ensures that we don't check post-non rewrite operations (like adding headers).
