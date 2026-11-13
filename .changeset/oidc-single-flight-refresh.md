---
'@vercel/oidc': patch
---

Share one in-flight OAuth refresh between concurrent `getVercelOidcToken()` calls, and stop erasing the Vercel CLI login (`auth.json`) when a token refresh fails. If another process saved a fresh login in the meantime, it is used instead.
