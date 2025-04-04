---
'vercel': minor
---

`vercel dev` can now automatically refresh the `VERCEL_OIDC_TOKEN` environment
variable before it expires in `.env.local` files. This feature is currently
opt-in. Set the local environment variable `REFRESH_VERCEL_OIDC_TOKEN` to enable
it.
