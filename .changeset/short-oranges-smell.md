---
'@vercel/fs-detectors': patch
'@vercel/routing-utils': patch
'vercel': patch
---

Services routing improvements:

- Fix route ownership scoping so parent service catch-alls (e.g. Vite SPA fallback) don't capture sibling service prefixes
- Move shared ownership-guard helpers (`getOwnershipGuard`, `scopeRouteSourceToOwnership`) to `@vercel/routing-utils`
- Place runtime service function outputs under internal `/_svc/<service>/index` namespace to prevent filesystem path leakage
- Block `/_svc` as a reserved routePrefix in service validation
- Scope all builder-emitted routes (not just route-owning builders) to their service ownership before merging
