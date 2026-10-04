---
'vercel': patch
---

Pass `VERCEL_CLI_VERSION` to functions started by `vercel dev` alongside the queue broker settings, so `@vercel/queue` uses the local broker inside queue-triggered functions.
