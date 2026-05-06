---
'@vercel/oidc': minor
'@vercel/oidc-aws-credentials-provider': patch
'@vercel/functions': patch
---

Add `getVercelOidcTokenFromContext()` and deprecate `getVercelOidcTokenSync()`. The old name implied a sync/async pair with `getVercelOidcToken()`, but the async variant additionally refreshes expired tokens — the difference is what they do, not how. The deprecated alias is preserved.
