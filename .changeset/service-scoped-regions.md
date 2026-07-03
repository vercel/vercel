---
'@vercel/build-utils': minor
'@vercel/fs-detectors': minor
'vercel': minor
---

Add service-scoped `regions` and `functionFailoverRegions` to the `services` config in `vercel.json`. These apply to every function in the service and can be overridden per function via the service's `functions` config.
