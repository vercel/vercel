---
'@vercel/oidc': minor
---

- Add optional `teamId` and `projectId` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json`
- Add `expirationBufferMs` option to both `getVercelOidcToken()` and `getVercelCliToken()` to proactively refresh tokens before they expire (useful for avoiding auth errors mid-request)
- Export `getVercelCliToken()` function with `GetVercelCliTokenOptions` interface to allow refreshing CLI tokens with configurable expiration buffer