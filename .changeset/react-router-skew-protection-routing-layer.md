---
'@vercel/remix-builder': patch
'@vercel/react-router': patch
---

Set the `__vdpl` Skew Protection cookie for React Router via a routing-layer header rule instead of `Set-Cookie` on the SSR response, so document responses stay cacheable by the CDN.
