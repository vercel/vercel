---
"@vercel/python-runtime": patch
---

Expose `VERCEL_OIDC_TOKEN` as the `x-vercel-oidc-token` request header when no request-scoped OIDC header is present.
