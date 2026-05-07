---
'@vercel/cli-auth': minor
'@vercel/cli-config': minor
'@vercel/oidc': minor
'vercel': minor
---

Add configurable `credStorage` handling across the CLI auth stack and teach `@vercel/oidc` to fall back to `vercel project token` when credentials are likely stored in the keyring.
