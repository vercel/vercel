---
'vercel': patch
---

Fix function size analysis to include functions hitting the exact 250 MB limit and surface a new warning for functions approaching the 250 MB limit. Requires `VERCEL_ANALYZE_BUILD_OUTPUT=1`.
