---
'vercel': patch
---

Add the beta `vercel flags stale` command to list feature flags that have not been updated recently.

By default, the command lists active flags that have not changed in 90 days. Use `--older-than` to change the threshold, `--state` to inspect archived flags, and `--json` for structured output.
