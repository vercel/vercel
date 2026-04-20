---
"@vercel/functions": major
---

Remove OIDC exports from @vercel/functions

BREAKING CHANGE: The `@vercel/functions/oidc` subpath is no longer available.

- Use `@vercel/oidc` for `getVercelOidcToken` and `getVercelOidcTokenSync`
- Use `@vercel/oidc-aws-credentials-provider` for `awsCredentialsProvider`
