---
'vercel': patch
---

Fix metrics output formatting for aggregation-transforming measures (`percent`, `persecond`, `unique`). The displayed unit and stat columns now reflect the effective aggregation rather than the raw measure unit — e.g. `percent` shows `%` instead of `bytes`, `persecond` appends `/s`, and `unique` hides the unit entirely.
