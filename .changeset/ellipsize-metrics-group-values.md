---
'vercel': patch
---

Ellipsize long group values in `metrics` text output to prevent excessively wide tables. Values exceeding 60 characters are truncated by keeping equal start/end portions with `…` in the middle.
