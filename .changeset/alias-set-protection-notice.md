---
'vercel': patch
---

`vercel alias set` now warns when Deployment Protection still guards the new alias, and points to `vercel curl` to access it. Under Standard Protection, an alias that isn't a domain added to the project stays protected even when it points to a production deployment.
