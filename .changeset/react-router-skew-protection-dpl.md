---
'@vercel/react-router': minor
---

Implement Skew Protection via `?dpl=<deploymentId>` asset URL pinning.

When `VERCEL_SKEW_PROTECTION_ENABLED=1`, the node and edge entry-server handlers
now append `?dpl=<VERCEL_DEPLOYMENT_ID>` to every script module, JS import, CSS,
and fog-of-war manifest URL emitted by `<ServerRouter>`.  This allows Vercel's
edge to route asset requests to the deployment that produced them, eliminating
the `/assets/*` 404 storms that occur when a new deployment goes live while
users still have stale CDN-cached HTML pages.

Unlike the previous `Set-Cookie: __vdpl=…` approach, query-param pinning does
not attach a `Set-Cookie` header to the SSR response, so pages configured with
`s-maxage` or `Cache-Control: public` remain fully CDN-cacheable.
