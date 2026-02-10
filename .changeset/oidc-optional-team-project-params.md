---
'@vercel/oidc': minor
---

- Add optional `team` and `project` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json`
- Add `expirationBufferMs` option to both `getVercelOidcToken()` and `getVercelToken()` to proactively refresh tokens before they expire (useful for avoiding auth errors mid-request)
- Export `getVercelToken()` function with `GetVercelTokenOptions` interface to allow refreshing CLI tokens with configurable expiration buffer
