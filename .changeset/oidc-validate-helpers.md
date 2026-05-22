---
'@vercel/oidc': minor
---

Add `isValidVercelOidcToken` and `assertValidVercelOidcToken` helpers for verifying the signature, expiration, and claims of a Vercel OIDC token against one or more matchers. The matchers support every claim in the OIDC token (e.g. `team`, `project`, `environment`, `teamId`, `projectId`). When `assertValidVercelOidcToken` rejects a token it throws a new `UnacceptableVercelOidcTokenError`. The implementation has no runtime dependencies; it uses the platform `SubtleCrypto` and `fetch` APIs and works in Node and browser environments.
