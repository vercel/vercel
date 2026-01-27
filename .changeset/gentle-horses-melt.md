---
'@vercel/functions': minor
---

Fix cache tags to be URL encoded before being sent to the cache API. Tags containing special characters (spaces, commas, ampersands, etc.) are now properly encoded using `encodeURIComponent`. This  
ensures tags like `"my tag"` or `"category,item"` are correctly handled when setting cache entries or expiring tags.
