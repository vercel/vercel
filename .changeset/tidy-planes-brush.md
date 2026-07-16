---
'vercel': patch
---

Write `[SENSITIVE]` placeholder instead of an empty string when `vercel env pull` encounters sensitive environment variables whose values cannot be read, so an unset value is distinguishable from a redacted one
