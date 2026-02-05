---
'@vercel/oidc': minor
---

## New Features

- Add optional `teamId` and `projectId` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json`
- Add `bufferMs` option to `getVercelOidcToken()` to proactively refresh tokens before they expire (useful for avoiding auth errors mid-request)
- Export `getVercelCliToken()` function to allow refreshing CLI tokens with automatic retry on expiry
