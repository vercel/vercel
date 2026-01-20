---
'vercel': patch
---

Inject NEXT_PUBLIC_VERCEL_ENV and NEXT_PUBLIC_VERCEL_TARGET_ENV during `vercel build` and `vercel deploy --prebuilt`.

When using `vercel build` locally followed by `vercel deploy --prebuilt`, the CLI now automatically injects `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, and `NEXT_PUBLIC_VERCEL_TARGET_ENV` environment variables based on the deployment target:

- With `--prod` flag → `production`
- With `--target production` → `production`  
- With `--target preview` → `preview`
- Default (no flags) → `preview`

This allows the build output to know what environment it's targeting, making the local build environment match Vercel's infrastructure.
