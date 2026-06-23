---
'@vercel/routing-utils': minor
'vercel': patch
---

Make the `type` discriminator optional on a service-targeted route/rewrite
`destination`. A destination object is now identified by the presence of
`service`, so `{ "service": NAME, "path"?: ... }` is accepted. The legacy
`{ "type": "service", "service": NAME }` form continues to validate for
backward compatibility.
