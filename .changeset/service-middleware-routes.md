---
'@vercel-internals/cli-builder-integration': patch
---

Do not scope middleware routes to service ownership in services mode. Middleware routes are indexed by their exact `src` downstream, so wrapping them with the ownership guard broke deploys of services-mode projects that have a middleware.
