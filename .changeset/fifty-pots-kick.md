---
'@vercel/oidc-aws-credentials-provider': major
'@vercel/oidc': major
'@vercel/functions': patch
---

extract oidc and aws oidc credential helpers from @vercel/functions into @vercel/oidc and @vercel/oidc-aws-credentials-provider. @vercel/functions re-exports the new functions as deprecated to maintain backwards compatibility.
