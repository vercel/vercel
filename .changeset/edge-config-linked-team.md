---
'vercel': patch
---

Scope `vercel edge-config` subcommands to the locally linked project's team by default, matching `vercel env`, `vercel crons`, etc. Falls back to the globally configured team when no project is linked.
