---
'@vercel/oidc': minor
'@vercel/oidc-aws-credentials-provider': minor
'@vercel/functions': minor
---

Add an opt-in AWS project identity exchange and `enableProjectIdentity` support in both AWS credential providers. Prepared IAM roles can use immutable project identities while existing callers retain the standard OIDC flow.
