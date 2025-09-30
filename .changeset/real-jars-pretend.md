---
'@vercel/oidc': patch
---

feat(oidc): add conditional export for browsers

Introduces a browser export with mock methods that don't require access to a file system or environment variables. This makes `@vercel/oidc` usable for universal libraries that are run in both frontend and backend.