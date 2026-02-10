---
'@vercel/fs-detectors': patch
'vercel': patch
---

* Fix services routing for runtime entrypoints by using extensionless function destinations, disabling framework `defaultRoutes` injection during services builds, and ensuring deterministic route merging precedence for services.
* Scope route-owning builder routes to their owning service prefixes in services mode, preventing cross-service route leakage
