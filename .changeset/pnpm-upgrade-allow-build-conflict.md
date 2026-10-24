---
'vercel': patch
---

Fix `vercel upgrade` on pnpm 12 when the global config sets `allowBuilds: { esbuild: false }`: retry the install without `--allow-build` instead of failing with `ERR_PNPM_OVERRIDING_IGNORED_BUILT_DEPENDENCIES`.
