---
'@vercel/remix-builder': patch
---

Sort dynamic route patterns by React Router specificity so that routes in their own server bundle are not shadowed by earlier catch-all routes
