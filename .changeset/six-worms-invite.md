---
'vercel': patch
---

Narrow return types for `routes.redirect()` and `routes.rewrite()` overloads so calls without transform options return `Redirect` / `Rewrite` instead of `Redirect | Route` / `Rewrite | Route`.
