---
'@vercel/next': patch
---

Fixes a case where using `basePath` along with static generation would output a lambda that conflicts with the root route.
