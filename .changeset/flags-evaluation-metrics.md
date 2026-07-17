---
'vercel': minor
---

Add `vercel flags evaluations` for viewing compact, per-variant evaluation charts and bucket-level JSON data with truncation metadata.

Examples:

```bash
vercel flags evaluations my-feature
vercel flags evaluations my-feature --since 24h --granularity 1h
vercel flags evaluations my-feature --since 24h --json
```
