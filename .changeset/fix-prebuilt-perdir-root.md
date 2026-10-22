---
'vercel': patch
'@vercel/client': patch
---

Fix `vercel deploy --prebuilt` from a monorepo app linked in place not finding `filePathMap` files written by `vercel build`, and fix the doubled `relative()` in the "File does not exist" error message.
