---
"vercel": patch
---

Fix update checker running after `vercel build` on Vercel by reading env vars before CLI internals can unset them
