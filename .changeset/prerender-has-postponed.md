---
'@vercel/build-utils': minor
'@vercel/next': patch
---

Add a per-route `hasPostponed` signal to `Prerender`.

`@vercel/build-utils` exposes a new optional `hasPostponed?: boolean` field on `Prerender` / `PrerenderOptions`. It is a tri-state: `true` when the route's `.meta` postponed state is present (React suspended during the build-time prerender), `false` when the framework prerendered a Prerender route without postponing, and `undefined` when the framework did not provide the signal.

`@vercel/next` populates it for app-router PPR routes (computed from the route's postponed state) and leaves it `undefined` for pages-router and other non-app-router prerenders. This is an additive, finer-grained signal — it does not change the existing `chain` / `experimentalStreamingLambdaPath` behavior — so downstream consumers can distinguish a route that actually postponed from one that has PPR machinery but fully prerendered (e.g. under `cacheComponents: true`).
