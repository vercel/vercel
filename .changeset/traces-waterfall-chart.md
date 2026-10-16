---
'vercel': patch
---

`vercel traces get` now renders a waterfall chart of spans when run in a terminal, collapsing repeated sibling spans into one row. Piped and agent output keeps the markdown summary.
