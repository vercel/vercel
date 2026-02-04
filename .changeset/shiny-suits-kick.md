---
'@vercel/fs-detectors': minor
'@vercel/build-utils': minor
'@vercel/python': minor
'vercel': minor
---

Add multi-service support for `vercel dev`. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set, the CLI auto-detects different multi-service layouts and orchestrates dev servers for each service through a single proxy server.
