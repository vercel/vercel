---
'@vercel/routing-utils': minor
'vercel': patch
---

Make hand-written service-targeted route/rewrite `destination` config less repetitive and verbose by making the `type` discriminator optional.

```diff
 {
   "rewrites": [{
-    "type": "service",
     "service": "my_backend",
     "path": "/api/$1"
   }]
 }
```

The legacy `{ "type": "service", "service": NAME }` form continues to validate
for backward compatibility. Normalized route output continues to include
`"type": "service"`, so machine-facing config remains canonical.
