---
'vercel': patch
---

Skip legacy Sensitive Environment Variables Policy in `vercel env add` and `vercel env update` when `VERCEL_ENV_VAR_CONFIG_SECRET_UI` is set, and allow secrets in Development under that flag.
