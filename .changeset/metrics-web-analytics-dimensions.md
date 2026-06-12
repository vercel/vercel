---
'vercel': patch
---

Allow `vc metrics` to group Web Analytics pageview and custom event metrics by all supported analytics dimensions, preserve requested time bounds so the query endpoint owns bucket rounding, and pass through an optional `--bucket-timezone` for calendar bucket alignment.
