---
'@vercel/oidc': minor
---

Add optional `teamId` and `projectId` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json`
