---
'@vercel/routing-utils': minor
---

Support a service-targeted `destination` object (`{ type: "service", service, path }`) on routes and rewrites, so a route/rewrite can delegate into a named service from `services` (RFC: Vercel Backends). The string `destination` keeps its existing alias-for-`dest` behavior; the object form is preserved through normalization.
