---
'vercel': patch
---

Fix `vc build` behavior in an unlinked directory. The link flow now runs before the "Run `vercel pull`?" prompt instead of firing as a side effect of the pull, and the freshly-established link is picked up on the same run — previously the first build computed a wrong work path (e.g. `apps/api/apps/api`) that only corrected itself on a subsequent run.
