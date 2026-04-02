---
'vercel': patch
---

Cache the authenticated `userId` in the CLI auth config to reduce unnecessary `getUser()` requests.
