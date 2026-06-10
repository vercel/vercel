---
'@vercel/routing-utils': minor
---

Support a service-targeted `destination` object (`{ type: "service", service, path }`) on routes and rewrites, so a route/rewrite can delegate into a named service. The service handoff is terminal: `continue: true` together with a service `destination` is rejected during normalization.
