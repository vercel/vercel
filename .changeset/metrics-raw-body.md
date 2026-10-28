---
'vercel': minor
---

Add `vercel metrics --body` to run a raw `/metrics/v1` query body, with multiple metrics and formulas. The body accepts inline JSON, `@file`, or `@-` for stdin, and the CLI fills in `scope` and `timeRange` from the linked project and `--since`/`--until` when the body leaves them out.
