---
'vercel': patch
---

Skip legacy Sensitive Environment Variables Policy in `vercel env add` and `vercel env update` when `VERCEL_ENV_VAR_CONFIG_SECRET_UI` is set, and send `visibility` (`config`/`secret`) on create and update requests when not explicitly set via `--visibility` (omitted for public-prefixed keys that cannot use secret visibility). Development still disallows secrets.
