---
'vercel': patch
---

`vercel firewall overview` now reports permission denials and timeouts distinctly instead of as generic API failures, matching `firewall status`, and only suggests re-running when a retry could succeed.
