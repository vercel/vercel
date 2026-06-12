---
'vercel': patch
---

Improve `vc metrics`: source groupable dimensions from the metric schema instead of a hardcoded list, preserve the requested time bounds so the query endpoint owns bucket rounding, and add an optional `--bucket-timezone` flag for calendar bucket alignment (it only affects bucket boundaries, not the `--since`/`--until` range or output timestamps).
