---
'@vercel/fs-detectors': patch
'vercel': patch
---

Fix services routing for runtime entrypoints by using extensionless function destinations, disabling framework `defaultRoutes` injection during services builds, and ensuring deterministic route merging precedence for services.
